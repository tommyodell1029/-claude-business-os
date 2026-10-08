import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "../jarvis/brain.ts";
import { fakeDb, OWNER } from "../jarvis/testkit.ts";
import { runOwnerAction, runTool, sortOpportunities } from "../jarvis/tools.ts";
import type { ToolCtx } from "../jarvis/tools.ts";
import { monetizationView, validateModels, validateValidation } from "./monetization.ts";
import { whatNext } from "./next.ts";
import { createOpportunity } from "./opportunities.ts";
import { radarCategory, researchOpportunity } from "./research.ts";
import { effectiveConfig, setAiPaused } from "./settings.ts";

const NOW = Date.parse("2026-10-08T16:00:00Z");
const ENV = { ANTHROPIC_API_KEY: "test" };
const ctxOf = (db: ReturnType<typeof fakeDb>["db"], fetchImpl: typeof fetch = fetch): ToolCtx => ({ db, email: OWNER, env: ENV, fetchImpl, now: NOW });
const mustNotCall = (() => { throw new Error("must not call the model"); }) as unknown as typeof fetch;

test("monetization: only known models with integer fits and reasons, one per model, best first", () => {
  const m = validateModels([
    { model: "affiliate", fit: 7, reason: "Programs pay 30% recurring" },
    { model: "saas", fit: 9, reason: "Competitors charge $29/mo" },
    { model: "affiliate", fit: 2, reason: "duplicate" },
    { model: "crypto", fit: 10, reason: "x" },
    { model: "digital_product", fit: 7.5, reason: "not an integer" },
    { model: "service", fit: 6 },
    "junk",
  ]);
  assert.deepEqual(m.map((x) => [x.model, x.fit]), [["saas", 9], ["affiliate", 7]]);
  assert.equal(validateModels("nope").length, 0);
});

test("cheapest validation: known method, description, sane cost and days; otherwise null", () => {
  assert.ok(validateValidation({ method: "landing_page", description: "Waitlist page + 3 posts", est_cost_usd: 20, est_days: 7 }));
  assert.equal(validateValidation({ method: "billboard", description: "x", est_cost_usd: 1, est_days: 1 }), null);
  assert.equal(validateValidation({ method: "waitlist", description: "", est_cost_usd: 1, est_days: 1 }), null);
  assert.equal(validateValidation({ method: "waitlist", description: "x", est_cost_usd: -5, est_days: 1 }), null);
  assert.equal(validateValidation({ method: "waitlist", description: "x", est_cost_usd: 5, est_days: 2.5 }), null);
});

test("monetization view: derived fields come from stored sub-scores; 'without software' excludes SaaS", () => {
  const v = monetizationView({
    s_recurring: 8, s_affiliate: "6", est_days_to_first_dollar: 10, validation_difficulty: 2,
    monetization_models: [{ model: "saas", fit: 9, reason: "a" }, { model: "affiliate", fit: 7, reason: "b" }, { model: "service", fit: 4, reason: "c" }],
    cheapest_validation: { method: "concierge", description: "Do it by hand for 3 buyers", est_cost_usd: 0, est_days: 5 },
  });
  assert.equal(v.analyzed, true);
  assert.deepEqual(v.withoutSoftware, ["affiliate"]);
  assert.deepEqual([v.recurring, v.affiliate, v.saas, v.digitalProduct], [8, 6, 9, null]);
  assert.equal(v.cheapestValidation?.method, "concierge");
  assert.equal(monetizationView({}).analyzed, false);
});

const HIT = { type: "web_search_result", url: "https://forum.example/t/need-video-editor", title: "t" };
const researchReply = (evidenceUrl: string) => (async () => Response.json({
  stop_reason: "end_turn",
  usage: { input_tokens: 9000, output_tokens: 600, server_tool_use: { web_search_requests: 2 } },
  content: [{ type: "web_search_tool_result", content: [HIT] }, { type: "text", text: JSON.stringify({
    evidence: [{ kind: "demand", claim: "Creators ask for editors weekly", source_url: evidenceUrl }],
    scores: { demand: 7 }, reasons: { demand: "weekly requests" },
    monetization_models: [{ model: "service", fit: 8, reason: "Editors charge $50/video" }, { model: "nonsense", fit: 9, reason: "x" }],
    cheapest_validation: { method: "concierge", description: "Edit 3 videos for paying creators", est_cost_usd: 0, est_days: 7 },
  }) }],
})) as unknown as typeof fetch;

test("research stores the monetization analysis only when this run produced grounded evidence", async () => {
  const fx = fakeDb();
  const c = await createOpportunity(fx.db, { name: "AI video editing service", category: "ai_income" });
  const id = String(("opportunity" in c ? c.opportunity : { id: "" }).id);
  const r = await researchOpportunity({ db: fx.db, env: ENV, fetchImpl: researchReply("https://forum.example/t/need-video-editor"), now: NOW }, id);
  assert.equal(r.models, 1);
  const row = fx.tables.opportunities[0];
  assert.deepEqual((row.monetization_models as { model: string }[]).map((m) => m.model), ["service"]);
  assert.equal((row.cheapest_validation as { method: string }).method, "concierge");

  const fx2 = fakeDb();
  const c2 = await createOpportunity(fx2.db, { name: "Ungrounded idea", category: "ai_income" });
  const id2 = String(("opportunity" in c2 ? c2.opportunity : { id: "" }).id);
  await researchOpportunity({ db: fx2.db, env: ENV, fetchImpl: researchReply("https://invented.example/x"), now: NOW }, id2);
  assert.equal(fx2.tables.opportunities[0].monetization_models, undefined, "no grounded evidence: nothing stored");
});

test("emergency stop: ULTRON, Radar and research refuse before any model call, and it is logged", async () => {
  const fx = fakeDb();
  assert.equal(await setAiPaused(fx.db, OWNER, true, NOW), true);
  const turn = await runTurn([{ role: "user", content: "brief me" }], ctxOf(fx.db, mustNotCall));
  assert.match(turn.reply, /AI is stopped/);
  const radar = await radarCategory({ db: fx.db, env: ENV, fetchImpl: mustNotCall, now: NOW }, "ai_tools");
  assert.equal(radar.ok, false);
  assert.match(String(radar.error), /stopped/);
  assert.ok(fx.tables.activity.some((a) => a.action === "ai_stopped"));
  assert.equal(await setAiPaused(fx.db, OWNER, false, NOW), false);
  assert.equal(fx.tables.os_settings.length, 1, "one row, updated in place");
  assert.equal((await effectiveConfig(fx.db)).aiPaused, false);
});

test("next move: rules pick stop > stale experiment > start experiment on top researched > research > radar", async () => {
  const empty = fakeDb();
  assert.equal((await whatNext(empty.db, NOW)).recommended.kind, "run_radar");

  const fx = fakeDb();
  for (const n of ["Scored idea", "Rich idea"]) await createOpportunity(fx.db, { name: n, category: "ai_tools" });
  Object.assign(fx.tables.opportunities[0], { overall_score: "6.5", confidence: "0.8", status: "researched", cheapest_validation: { method: "waitlist", description: "Waitlist page", est_cost_usd: 10, est_days: 7 }, monetization_models: [{ model: "affiliate", fit: 7, reason: "r" }] });
  Object.assign(fx.tables.opportunities[1], { evidence_count: 5 });
  const n1 = await whatNext(fx.db, NOW);
  assert.equal(n1.recommended.kind, "start_experiment");
  assert.match(n1.recommended.text, /Waitlist page/);
  assert.equal((n1.top_opportunity as { name: string }).name, "Scored idea");

  fx.tables.opportunities[0].status = "validating";
  assert.equal((await whatNext(fx.db, NOW)).recommended.kind, "research");

  fx.tables.experiments = [{ id: "e1", name: "Old", status: "validating", started_at: "2026-09-01T00:00:00Z" }];
  assert.equal((await whatNext(fx.db, NOW)).recommended.kind, "decide_experiment");

  await setAiPaused(fx.db, OWNER, true, NOW);
  assert.equal((await whatNext(fx.db, NOW)).recommended.kind, "resume_ai");
});

test("owner actions from /os: only the four allowed tools, same checks as ULTRON, logged as owner", async () => {
  const fx = fakeDb();
  const ctx = ctxOf(fx.db);
  assert.equal((await runOwnerAction("radar_sweep", { category: "ai_tools" }, ctx)).ok, false, "spending actions have their own routes");
  assert.equal((await runOwnerAction("outreach_review", {}, ctx)).ok, false);
  assert.equal((await runOwnerAction("record_revenue", { venture: "X", amount_usd: 5, source: "stripe" }, ctx)).ok, false);
  const fut = await runOwnerAction("record_revenue", { venture: "X", amount_usd: 5, source: "manual", occurred_on: "2026-12-01" }, ctx);
  assert.ok(!fut.ok && /future/.test(fut.error));
  const ok = await runOwnerAction("create_experiment", { name: "Landing page test", budget_usd: 10 }, ctx);
  assert.ok(ok.ok);
  assert.equal(fx.tables.experiments.length, 1);
  assert.equal(fx.tables.activity.find((a) => a.action === "experiment_created")?.actor, "owner");
  assert.equal((fx.tables.jarvis_actions ?? []).length, 0, "no pending action: the owner tapped and confirmed on screen");
});

test("ULTRON: fastest sort puts unknown days last; cost per revenue dollar is null with no revenue", async () => {
  const items = [
    { name: "a", overall: 8, confidence: 0.5, daysToFirstDollar: null, createdAt: "1", labels: { tier: 1 } },
    { name: "b", overall: 5, confidence: 0.9, daysToFirstDollar: 3, createdAt: "2", labels: { tier: 0 } },
    { name: "c", overall: 6, confidence: 0.7, daysToFirstDollar: 3, createdAt: "3", labels: { tier: 0 } },
  ];
  assert.deepEqual(sortOpportunities(items, "fastest").map((x) => x.name), ["c", "b", "a"]);
  assert.deepEqual(sortOpportunities(items, "confidence").map((x) => x.name), ["b", "c", "a"]);
  const fx = fakeDb({ ai_cost_daily: [{ day: "2026-10-08", calls: 2, input_tokens: 1, output_tokens: 1, cost_usd: "0.30", any_estimated: false }] });
  const c = (await runTool("ai_cost_summary", {}, ctxOf(fx.db))).content as { ai_cost_per_revenue_dollar: number | null };
  assert.equal(c.ai_cost_per_revenue_dollar, null);
  fx.tables.revenue_entries = [{ venture: "V", source: "manual", amount_usd: "60", cost_usd: "0", occurred_on: "2026-10-07" }];
  const c2 = (await runTool("ai_cost_summary", {}, ctxOf(fx.db))).content as { ai_cost_per_revenue_dollar: number | null };
  assert.equal(c2.ai_cost_per_revenue_dollar, 0.005);
});
