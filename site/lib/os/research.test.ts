import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS_CONFIG } from "../jarvis/models.generated.ts";
import { fakeDb } from "../jarvis/testkit.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { createOpportunity } from "./opportunities.ts";
import { extractJson, groundEvidence, radarCategory, researchOpportunity, urlKey, worstCase } from "./research.ts";
import { dayKey } from "./usage.ts";

const NOW = Date.parse("2026-10-08T16:00:00Z");
const ENV = { ANTHROPIC_API_KEY: "test" };
const BUDGET = (OS_CONFIG as unknown as { budgets: { per_day_usd: number; per_research_run_usd: number } }).budgets;
const HITS = [
  { type: "web_search_result", url: "https://www.marketplace.example/templates/resume?ref=x", title: "Resume templates" },
  { type: "web_search_result", url: "https://forum.example/t/need-ai-resume-help/", title: "Forum thread" },
];
const searchBlock = { type: "web_search_tool_result", tool_use_id: "s1", content: HITS };
const reply = (json: unknown, extra: Record<string, unknown> = {}) =>
  Response.json({
    stop_reason: "end_turn",
    usage: { input_tokens: 20000, output_tokens: 900, server_tool_use: { web_search_requests: 2 } },
    content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } }, searchBlock, { type: "text", text: "```json\n" + JSON.stringify(json) + "\n```" }],
    ...extra,
  });
const fetchSeq = (responses: (() => Response)[], seen: unknown[] = []) => {
  let i = 0;
  return (async (_u: string, init: RequestInit) => {
    seen.push(JSON.parse(String(init.body)));
    return responses[Math.min(i++, responses.length - 1)]();
  }) as unknown as typeof fetch;
};

test("url keys and JSON extraction", () => {
  assert.equal(urlKey("https://www.Example.com/a/b/?q=1#x"), "example.com/a/b");
  assert.equal(urlKey("javascript:alert(1)"), null);
  assert.deepEqual(extractJson('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('noise {"b":[1,2]} trailing'), { b: [1, 2] });
  assert.equal(extractJson("no json here"), null);
  assert.equal(extractJson("[1,2]"), null);
});

test("evidence is kept only when its link came back from this call's searches", () => {
  const hits = HITS.map((h) => ({ url: h.url, title: h.title }));
  const { kept, dropped } = groundEvidence([
    { kind: "pricing", claim: "Templates list at $19-$49", source_url: "https://marketplace.example/templates/resume" },
    { kind: "demand", claim: "Invented stat", source_url: "https://made-up.example/report" },
    { kind: "demand", claim: "No link" },
    "garbage",
  ], hits);
  assert.equal(kept.length, 1);
  assert.equal(dropped, 3);
});

test("worst case stays inside the configured per-run cap for Radar and research", () => {
  const m = MODELS_CONFIG.models.small;
  const cfg = OS_CONFIG as unknown as { radar: { max_searches: number; max_tokens: number }; research: { max_searches: number; max_tokens: number } };
  assert.ok(worstCase(m, cfg.radar.max_searches, cfg.radar.max_tokens, 2000) < BUDGET.per_research_run_usd);
  assert.ok(worstCase(m, cfg.research.max_searches, cfg.research.max_tokens, 3000) < BUDGET.per_research_run_usd);
});

test("Radar stores only grounded opportunities, logs usage with searches, then serves the cache for free", async () => {
  const fx = fakeDb();
  const seen: Record<string, unknown>[] = [];
  const f = fetchSeq([() => reply({
    opportunities: [
      { name: "AI resume template pack", problem: "Rewrites take hours", audience: "career changers", monetization: ["one-time sale"],
        evidence: [{ kind: "pricing", claim: "Templates list at $19-$49", source_url: "https://marketplace.example/templates/resume" },
          { kind: "demand", claim: "Forum users ask for AI resume help", source_url: "https://forum.example/t/need-ai-resume-help" }] },
      { name: "Invented idea", evidence: [{ kind: "demand", claim: "Made up", source_url: "https://nowhere.example/x" }] },
    ],
  })], seen);
  const ctx = { db: fx.db, env: ENV, fetchImpl: f, now: NOW };
  const r = await radarCategory(ctx, "digital_products");
  assert.equal(r.ok, true);
  assert.deepEqual([r.created, r.skipped, r.evidenceAdded, r.evidenceDropped], [1, 1, 2, 1]);
  assert.equal(fx.tables.opportunities.length, 1);
  assert.equal(fx.tables.opportunities[0].category, "digital_products");
  assert.equal(fx.tables.ai_usage[0].web_searches, 2);
  assert.equal(fx.tables.ai_usage[0].task, "radar_sweep");
  assert.ok(Number(fx.tables.ai_usage[0].est_cost_usd) > 0.02, "includes $0.01 per search");
  const tool = (seen[0].tools as { type: string; max_uses: number }[])[0];
  assert.equal(tool.type, "web_search_20250305");
  assert.equal(seen[0].model, MODELS_CONFIG.models.small);

  const again = await radarCategory({ ...ctx, fetchImpl: fetchSeq([() => { throw new Error("must not call the model"); }]) }, "digital_products");
  assert.equal(again.cached, true);
  assert.equal(again.spentUsd, 0);
  assert.equal(fx.tables.ai_usage.length, 1);
});

test("Radar refuses before calling the model when today's budget cannot cover the worst case", async () => {
  const fx = fakeDb({ ai_cost_daily: [{ day: dayKey(NOW, "America/New_York"), cost_usd: String(BUDGET.per_day_usd - 0.01) }] });
  let calls = 0;
  const f = (async () => { calls += 1; return reply({}); }) as unknown as typeof fetch;
  const r = await radarCategory({ db: fx.db, env: ENV, fetchImpl: f, now: NOW }, "ai_tools");
  assert.equal(r.ok, false);
  assert.match(String(r.error), /budget/);
  assert.equal(calls, 0);
  assert.equal(fx.tables.activity[0].action, "budget_stop");
  assert.equal(fx.tables.research_runs[0].status, "budget_refused");
});

test("unknown category and missing key are clean errors", async () => {
  const fx = fakeDb();
  assert.equal((await radarCategory({ db: fx.db, env: ENV, fetchImpl: fetch, now: NOW }, "crypto_moonshots")).error, "unknown category");
  assert.match(String((await radarCategory({ db: fx.db, env: {}, fetchImpl: fetch, now: NOW }, "ai_tools")).error), /ANTHROPIC_API_KEY/);
});

test("research: grounded evidence + validated scores, unknown dimensions ignored, status becomes researched; pause_turn continues", async () => {
  const fx = fakeDb();
  const c = await createOpportunity(fx.db, { name: "AI resume template pack", category: "digital_products" });
  const id = String(("opportunity" in c ? c.opportunity : { id: "" }).id);
  const paused = () => Response.json({ stop_reason: "pause_turn", usage: { input_tokens: 5000, output_tokens: 10, server_tool_use: { web_search_requests: 1 } }, content: [searchBlock] });
  const done = () => reply({
    evidence: [{ kind: "pricing", claim: "Templates list at $19-$49", source_url: "https://marketplace.example/templates/resume" },
      { kind: "demand", claim: "Invented", source_url: "https://fake.example/" }],
    scores: { demand: 7, monetization: 8, vibes: 10 }, reasons: { demand: "forum requests", monetization: "listed prices", vibes: "x" },
    validation_difficulty: 2, est_days_to_first_dollar: 10,
  });
  const r = await researchOpportunity({ db: fx.db, env: ENV, fetchImpl: fetchSeq([paused, done]), now: NOW }, id);
  assert.equal(r.ok, true);
  assert.deepEqual([r.evidenceAdded, r.evidenceDropped, r.scored], [1, 1, 2]);
  const row = fx.tables.opportunities[0];
  assert.equal(row.s_demand, 7);
  assert.equal(row.status, "researched");
  assert.equal(row.validation_difficulty, 2);
  assert.ok(Number(row.overall_score) > 0, "rescored in code");
  assert.equal(fx.tables.ai_usage.length, 2, "both the paused and the continued request are logged");
});

test("research with no grounded evidence stores no scores", async () => {
  const fx = fakeDb();
  const c = await createOpportunity(fx.db, { name: "Unsupported idea", category: "ai_tools" });
  const id = String(("opportunity" in c ? c.opportunity : { id: "" }).id);
  const f = fetchSeq([() => reply({ evidence: [{ kind: "demand", claim: "x", source_url: "https://fake.example/" }], scores: { demand: 9 }, reasons: { demand: "trust me" } })]);
  const r = await researchOpportunity({ db: fx.db, env: ENV, fetchImpl: f, now: NOW }, id);
  assert.equal(r.scored, 0);
  assert.equal(fx.tables.opportunities[0].s_demand, undefined);
});

test("a request that dies mid-flight is still logged, at an estimated worst case, so budgets stay conservative", async () => {
  const fx = fakeDb();
  const f = (async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
  const r = await radarCategory({ db: fx.db, env: ENV, fetchImpl: f, now: NOW }, "ai_tools");
  assert.equal(r.ok, false);
  assert.match(String(r.error), /TimeoutError/);
  assert.equal(fx.tables.ai_usage.length, 1);
  assert.equal(fx.tables.ai_usage[0].ok, false);
  assert.equal(fx.tables.ai_usage[0].estimated, true);
  assert.ok(Number(fx.tables.ai_usage[0].est_cost_usd) > 0);
});
