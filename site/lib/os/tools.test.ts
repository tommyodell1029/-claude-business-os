import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "../jarvis/brain.ts";
import { handleConfirm } from "../jarvis/confirm.ts";
import { fakeDb, OWNER } from "../jarvis/testkit.ts";
import { runTool, validateToolInput } from "../jarvis/tools.ts";
import type { ToolCtx } from "../jarvis/tools.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { createOpportunity } from "./opportunities.ts";
import { LIMITS, effectiveConfig, saveBudgets, validatePatch } from "./settings.ts";
import { dayKey } from "./usage.ts";

const NOW = Date.parse("2026-10-08T16:00:00Z");
const DEFAULTS = (OS_CONFIG as unknown as { budgets: Record<string, number> }).budgets;

function setup(seed: Record<string, Record<string, unknown>[]> = {}, fetchImpl: typeof fetch = fetch) {
  const fx = fakeDb(seed);
  const ctx = (now = NOW): ToolCtx => ({ db: fx.db, email: OWNER, env: { ANTHROPIC_API_KEY: "test" }, fetchImpl, now });
  return { ...fx, ctx };
}

async function proposeAndConfirm(s: ReturnType<typeof setup>, tool: string, input: unknown) {
  const r = await runTool(tool, input, s.ctx());
  assert.ok(r.pending, `${tool} must only propose: ${JSON.stringify(r.content)}`);
  return { pending: r.pending!, out: await handleConfirm({ actionId: r.pending!.id, decision: "confirm", via: "tap" }, s.ctx(NOW + 10_000)) };
}

test("settings: only known budgets, within the yaml limits, rounded to cents", () => {
  assert.equal(validatePatch({ per_experiment_usd: 5 }).ok, false, "not editable");
  assert.equal(validatePatch({ prices: 1 }).ok, false);
  assert.equal(validatePatch({ per_day_usd: "3" }).ok, false);
  assert.equal(validatePatch({ per_day_usd: LIMITS.per_day_usd.max + 1 }).ok, false);
  assert.equal(validatePatch({ per_research_run_usd: LIMITS.per_research_run_usd.min - 0.01 }).ok, false);
  assert.equal(validatePatch({}).ok, false);
  const ok = validatePatch({ per_day_usd: 3.004 });
  assert.ok(ok.ok && ok.value.per_day_usd === 3);
});

test("settings: saved overrides apply, are logged, update in place; out-of-range rows are ignored", async () => {
  const fx = fakeDb({ os_settings: [{ key: "per_turn_usd", value: "99" }] });
  assert.equal((await effectiveConfig(fx.db)).budgets.per_turn_usd, DEFAULTS.per_turn_usd, "a row past the ceiling never applies");
  const b = await saveBudgets(fx.db, OWNER, { per_day_usd: 3 }, NOW);
  assert.equal(b.per_day_usd, 3);
  await saveBudgets(fx.db, OWNER, { per_day_usd: 1.5 }, NOW);
  assert.equal(fx.tables.os_settings.filter((r) => r.key === "per_day_usd").length, 1, "updated, not duplicated");
  assert.equal((await effectiveConfig(fx.db)).budgets.per_day_usd, 1.5);
  assert.equal(fx.tables.activity.filter((a) => a.action === "settings_changed").length, 2);
  assert.equal((await effectiveConfig(null)).budgets.per_day_usd, DEFAULTS.per_day_usd);
});

test("a lowered daily budget stops ULTRON before any model call", async () => {
  let calls = 0;
  const f = (async () => { calls += 1; throw new Error("must not call"); }) as unknown as typeof fetch;
  const s = setup({ os_settings: [{ key: "per_day_usd", value: "0.50" }], ai_cost_daily: [{ day: dayKey(NOW, "America/New_York"), cost_usd: "0.60" }] }, f);
  const r = await runTurn([{ role: "user", content: "brief me" }], s.ctx());
  assert.equal(calls, 0);
  assert.match(r.reply, /\$0\.50/);
});

test("Money OS read tools: ranked list and detail come from stored, code-computed data", async () => {
  const s = setup();
  const a = await createOpportunity(s.db, { name: "AI resume template pack", category: "digital_products" });
  await createOpportunity(s.db, { name: "Dead idea", category: "ai_tools" });
  s.tables.opportunities[0].overall_score = "7.2";
  s.tables.opportunities[1].status = "killed";
  const top = (await runTool("top_opportunities", {}, s.ctx())).content as { opportunities: { name: string; score: number }[] };
  assert.deepEqual(top.opportunities.map((o) => o.name), ["AI resume template pack"], "killed ones are left out");
  assert.equal(top.opportunities[0].score, 7.2);
  const id = String(("opportunity" in a ? a.opportunity : { id: "" }).id);
  const d = (await runTool("opportunity_detail", { opportunity_id: id }, s.ctx())).content as { scores: unknown[]; evidence_total: number };
  assert.equal(d.scores.length, 15);
  assert.equal(d.evidence_total, 0);
  const missing = (await runTool("opportunity_detail", { opportunity_id: "11111111-1111-4111-8111-111111111111" }, s.ctx())).content as { error: string };
  assert.match(missing.error, /no opportunity/);
});

test("Money OS write tools validate input: categories, statuses, numbers, dates", () => {
  assert.equal(validateToolInput("radar_sweep", { category: "crypto_moonshots" }).ok, false);
  assert.equal(validateToolInput("set_experiment_status", { experiment_id: "11111111-1111-4111-8111-111111111111", status: "deleted" }).ok, false);
  assert.equal(validateToolInput("record_revenue", { venture: "X", amount_usd: -1, source: "manual" }).ok, false);
  assert.equal(validateToolInput("record_revenue", { venture: "X", amount_usd: "40", source: "manual" }).ok, false);
  assert.equal(validateToolInput("record_revenue", { venture: "X", amount_usd: 40, source: "stripe" }).ok, false, "Stripe is never typed in");
  assert.equal(validateToolInput("record_revenue", { venture: "X", amount_usd: 40, source: "manual", occurred_on: "2026-02-30" }).ok, false);
  const ok = validateToolInput("record_revenue", { venture: "X", amount_usd: 40.004, source: "affiliate", occurred_on: "2026-10-07" });
  assert.ok(ok.ok && ok.value.amount_usd === 40);
});

test("create experiment, change status, kill opportunity: nothing happens until confirmed, then exactly once", async () => {
  const s = setup();
  const c = await createOpportunity(s.db, { name: "Creator invoice tool", category: "micro_saas" });
  const oppId = String(("opportunity" in c ? c.opportunity : { id: "" }).id);

  const r = await runTool("create_experiment", { name: "Landing page test", opportunity_id: oppId, target: "10 signups", budget_usd: 20 }, s.ctx());
  assert.ok(r.pending);
  assert.equal((s.tables.experiments ?? []).length, 0, "proposing writes nothing");
  assert.match(r.pending!.summary, /Landing page test.*\$20\.00/);
  const out = await handleConfirm({ actionId: r.pending!.id, decision: "confirm", via: "voice" }, s.ctx(NOW + 5_000));
  assert.equal(out.status, "executed");
  assert.equal(s.tables.experiments.length, 1);
  assert.equal(s.tables.experiments[0].status, "validating");
  assert.equal(s.tables.opportunities[0].status, "validating");

  const expId = String(s.tables.experiments[0].id);
  const st = await proposeAndConfirm(s, "set_experiment_status", { experiment_id: expId, status: "killed", result_note: "No signups in 7 days" });
  assert.equal(st.out.status, "executed");
  assert.equal(s.tables.experiments[0].status, "killed");
  assert.ok(s.tables.experiments[0].ended_at);
  const same = await runTool("set_experiment_status", { experiment_id: expId, status: "killed" }, s.ctx());
  assert.match(JSON.stringify(same.content), /already killed/);

  const k = await proposeAndConfirm(s, "kill_opportunity", { opportunity_id: oppId, reason: "No demand" });
  assert.equal(k.out.status, "executed");
  assert.equal(s.tables.opportunities[0].status, "killed");
  assert.equal(s.tables.opportunities.length, 1, "killed, never deleted");
  assert.ok(s.tables.activity.some((a) => a.action === "opportunity_killed"));
});

test("record revenue: future dates refused, amounts stored as given, unknown experiment refused", async () => {
  const s = setup();
  const fut = await runTool("record_revenue", { venture: "AI Resume Toolkit", amount_usd: 40, source: "marketplace", occurred_on: "2026-10-20" }, s.ctx());
  assert.match(JSON.stringify(fut.content), /future/);
  const bad = await runTool("record_revenue", { venture: "AI Resume Toolkit", amount_usd: 40, source: "manual", experiment_id: "11111111-1111-4111-8111-111111111111" }, s.ctx());
  assert.match(JSON.stringify(bad.content), /no experiment/);
  const { out } = await proposeAndConfirm(s, "record_revenue", { venture: "AI Resume Toolkit", amount_usd: 40, cost_usd: 5, source: "marketplace" });
  assert.equal(out.status, "executed");
  assert.deepEqual(
    [s.tables.revenue_entries[0].amount_usd, s.tables.revenue_entries[0].cost_usd, s.tables.revenue_entries[0].occurred_on],
    [40, 5, "2026-10-08"],
  );
});

test("radar and research via ULTRON: cost shown before confirm, the model is called only after confirm", async () => {
  let calls = 0;
  const hits = [{ type: "web_search_result", url: "https://forum.example/t/need-invoices", title: "t" }];
  const f = (async () => {
    calls += 1;
    return Response.json({
      stop_reason: "end_turn",
      usage: { input_tokens: 9000, output_tokens: 500, server_tool_use: { web_search_requests: 1 } },
      content: [{ type: "web_search_tool_result", content: hits }, { type: "text", text: JSON.stringify({ opportunities: [{ name: "Invoice templates for creators", evidence: [{ kind: "demand", claim: "Creators ask for invoice help", source_url: "https://forum.example/t/need-invoices" }] }] }) }],
    });
  }) as unknown as typeof fetch;
  const s = setup({}, f);
  const r = await runTool("radar_sweep", { category: "micro_saas" }, s.ctx());
  assert.ok(r.pending);
  assert.match(r.pending!.summary, /at most about \$0\.\d\d/);
  assert.equal(calls, 0, "proposing never calls the model");
  const out = await handleConfirm({ actionId: r.pending!.id, decision: "confirm", via: "tap" }, s.ctx(NOW + 5_000));
  assert.equal(out.status, "executed", out.message);
  assert.equal(calls, 1);
  assert.equal(s.tables.opportunities.length, 1);
  assert.match(out.message, /1 new opportunities/);

  const rejected = await runTool("research_opportunity", { opportunity_id: String(s.tables.opportunities[0].id) }, s.ctx());
  assert.match(rejected.pending!.summary, /Research "Invoice templates for creators"/);
  await handleConfirm({ actionId: rejected.pending!.id, decision: "reject", via: "tap" }, s.ctx(NOW + 6_000));
  assert.equal(calls, 1, "a rejected research run never calls the model");
});

test("every write tool is allowed by the latest jarvis_actions tool check in supabase/migrations", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { TOOLS } = await import("../jarvis/tools.ts");
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  let allowed: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(new URL(f, dir), "utf8");
    const m = sql.match(/jarvis_actions_tool_check check \(tool in \(([^)]*)\)/s) ?? sql.match(/create table if not exists public\.jarvis_actions[\s\S]*?tool\s+text not null check \(tool in \(([^)]*)\)/);
    if (m) allowed = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  for (const t of TOOLS.filter((x) => x.kind === "write")) assert.ok(allowed.includes(t.name), `${t.name} missing from the jarvis_actions tool check`);
});

test("what_next: stale experiments, best scored and most-evidenced unresearched opportunities, budget left, all from code", async () => {
  const s = setup({
    experiments: [
      { id: "e1", name: "Old test", status: "validating", started_at: "2026-09-20T12:00:00Z" },
      { id: "e2", name: "New test", status: "validating", started_at: "2026-10-07T12:00:00Z" },
    ],
    ai_cost_daily: [{ day: "2026-10-08", cost_usd: "0.29" }],
  });
  for (const n of ["Scored idea", "Thin idea", "Rich idea"]) await createOpportunity(s.db, { name: n, category: "ai_tools" });
  Object.assign(s.tables.opportunities[0], { overall_score: "6.5", confidence: "0.8", status: "researched" });
  Object.assign(s.tables.opportunities[1], { evidence_count: 1 });
  Object.assign(s.tables.opportunities[2], { evidence_count: 5 });
  const w = (await runTool("what_next", {}, s.ctx())).content as {
    experiments_needing_decision: { name: string }[]; best_opportunities: { name: string }[]; research_next: { name: string }[]; ai_budget_left_today: number;
  };
  assert.deepEqual(w.experiments_needing_decision.map((e) => e.name), ["Old test"]);
  assert.deepEqual(w.best_opportunities.map((o) => o.name), ["Scored idea"]);
  assert.deepEqual(w.research_next.map((o) => o.name), ["Rich idea", "Thin idea"]);
  assert.equal(w.ai_budget_left_today, Math.round((DEFAULTS.per_day_usd - 0.29) * 100) / 100);
  const rev = (await runTool("revenue_summary", {}, s.ctx())).content as { totals: { revenue: number } };
  assert.equal(rev.totals.revenue, 0, "no revenue is $0, never invented");
  const cost = (await runTool("ai_cost_summary", {}, s.ctx())).content as { today: { costUsd: number } };
  assert.equal(cost.today.costUsd, 0.29);
});
