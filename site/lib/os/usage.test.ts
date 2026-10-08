import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "../jarvis/brain.ts";
import { MODELS_CONFIG } from "../jarvis/models.generated.ts";
import { fakeDb, OWNER } from "../jarvis/testkit.ts";
import { OS_CONFIG } from "./config.generated.ts";
import type { OsConfig } from "./usage.ts";
import { checkBudget, costOf, dayKey, spentToday, tokensFrom } from "./usage.ts";

const CFG = OS_CONFIG as unknown as OsConfig;
const HAIKU = MODELS_CONFIG.models.small;
const T = (input: number, output: number, extra: Partial<{ cacheRead: number; cacheWrite: number; webSearches: number }> = {}) =>
  ({ input, output, cacheRead: 0, cacheWrite: 0, webSearches: 0, ...extra });

test("cost comes from config prices; unknown models are priced at the top listed rate and flagged", () => {
  const p = CFG.prices[HAIKU];
  assert.ok(p, "the small model must have a price in config/money_os.yaml");
  const c = costOf(HAIKU, T(1000, 500, { cacheRead: 2000, cacheWrite: 400 }));
  assert.equal(c.estimated, false);
  assert.equal(c.usd, Math.round(((1000 * p.input + 500 * p.output + 400 * p.cache_write + 2000 * p.cache_read) / 1e6) * 1e6) / 1e6);
  const top = Object.values(CFG.prices).reduce((a, b) => (b.output > a.output ? b : a));
  const u = costOf("some-new-model", T(1_000_000, 0));
  assert.deepEqual(u, { usd: top.input, estimated: true });
});

test("web searches without a configured price mark the cost estimated", () => {
  const cfg = { ...CFG, web_search_usd: null };
  assert.equal(costOf(HAIKU, T(10, 10, { webSearches: 2 }), cfg).estimated, true);
  const priced = costOf(HAIKU, T(0, 0, { webSearches: 2 }), { ...CFG, web_search_usd: 0.01 });
  assert.deepEqual(priced, { usd: 0.02, estimated: false });
});

test("token counts: real usage is exact, missing usage is estimated from text length", () => {
  const exact = tokensFrom({ input_tokens: 12, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 1, server_tool_use: { web_search_requests: 2 } }, { inChars: 0, outChars: 0 });
  assert.deepEqual(exact, { tokens: { input: 12, output: 7, cacheRead: 3, cacheWrite: 1, webSearches: 2 }, estimated: false });
  const est = tokensFrom(undefined, { inChars: 400, outChars: 41 });
  assert.deepEqual(est, { tokens: { input: 100, output: 11, cacheRead: 0, cacheWrite: 0, webSearches: 0 }, estimated: true });
  assert.equal(tokensFrom({ input_tokens: -5, output_tokens: Number.NaN }, { inChars: 0, outChars: 0 }).tokens.input, 0);
});

test("the budget day follows the owner's time zone", () => {
  assert.equal(dayKey(Date.parse("2026-10-08T03:00:00Z"), "America/New_York"), "2026-10-07");
  assert.equal(dayKey(Date.parse("2026-10-08T05:00:00Z"), "America/New_York"), "2026-10-08");
});

test("budget: refuses once the daily or per-request limit is reached; unreadable day falls back to per-request", () => {
  const cfg = { ...CFG, budgets: { ...CFG.budgets, per_day_usd: 2, per_turn_usd: 0.1 } };
  assert.deepEqual(checkBudget(0, 0, cfg), { ok: true });
  assert.deepEqual(checkBudget(1.95, 0.05, cfg), { ok: false, scope: "day", limitUsd: 2, spentUsd: 2 });
  assert.equal(checkBudget(0, 0.1, cfg).ok, false);
  assert.equal((checkBudget(0, 0.1, cfg) as { scope: string }).scope, "turn");
  assert.deepEqual(checkBudget(null, 0.05, cfg), { ok: true });
  assert.equal(checkBudget(null, 0.1, cfg).ok, false);
});

test("spentToday reads the daily view; no row is $0; no database or a failed read is null", async () => {
  const now = Date.parse("2026-10-08T15:00:00Z");
  const fx = fakeDb({ ai_cost_daily: [{ day: "2026-10-07", cost_usd: "9.00" }, { day: "2026-10-08", cost_usd: "0.42" }] });
  assert.equal(await spentToday(fx.db, now), 0.42);
  assert.equal(await spentToday(fakeDb().db, now), 0);
  assert.equal(await spentToday(null, now), null);
  const broken = { ...fx.db, select: async () => { throw new Error("supabase 500"); } };
  assert.equal(await spentToday(broken as typeof fx.db, now), null);
});

const reply = (text: string, usage?: Record<string, number>) =>
  Response.json({ stop_reason: "end_turn", content: [{ type: "text", text }], ...(usage ? { usage } : {}) });

test("Jarvis logs one ai_usage row per model call, with tokens and cost", async () => {
  const fx = fakeDb();
  const f = (async () => reply("Good morning, sir.", { input_tokens: 1200, output_tokens: 80 })) as unknown as typeof fetch;
  const out = await runTurn([{ role: "user", content: "hello" }], { db: fx.db, email: OWNER, env: { ANTHROPIC_API_KEY: "test" }, fetchImpl: f, now: Date.now() });
  assert.equal(out.reply, "Good morning, sir.");
  const rows = fx.tables.ai_usage;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].task, "jarvis_chat");
  assert.equal(rows[0].model, HAIKU);
  assert.equal(rows[0].input_tokens, 1200);
  assert.equal(rows[0].estimated, false);
  assert.equal(rows[0].est_cost_usd, costOf(HAIKU, T(1200, 80)).usd);
});

test("Jarvis without usage in the response logs an estimated row", async () => {
  const fx = fakeDb();
  const f = (async () => reply("Done, sir.")) as unknown as typeof fetch;
  await runTurn([{ role: "user", content: "hello" }], { db: fx.db, email: OWNER, env: { ANTHROPIC_API_KEY: "test" }, fetchImpl: f, now: Date.now() });
  assert.equal(fx.tables.ai_usage[0].estimated, true);
  assert.ok(Number(fx.tables.ai_usage[0].input_tokens) > 0);
});

test("Jarvis refuses before calling the model when today's budget is spent, and logs why", async () => {
  const now = Date.now();
  const fx = fakeDb({ ai_cost_daily: [{ day: dayKey(now, CFG.timezone), cost_usd: String(CFG.budgets.per_day_usd) }] });
  let calls = 0;
  const f = (async () => { calls += 1; return reply("should not happen"); }) as unknown as typeof fetch;
  const out = await runTurn([{ role: "user", content: "hello" }], { db: fx.db, email: OWNER, env: { ANTHROPIC_API_KEY: "test" }, fetchImpl: f, now });
  assert.equal(calls, 0);
  assert.match(out.reply, /today's AI budget/);
  assert.equal(fx.tables.activity[0].action, "budget_stop");
  assert.equal(fx.tables.ai_usage, undefined);
});

test("Jarvis stops a tool loop once the per-request cap is spent", async () => {
  const fx = fakeDb();
  let calls = 0;
  // every round costs more than the per-request cap, and asks for another tool call
  const big = Math.ceil((CFG.budgets.per_turn_usd * 1e6) / CFG.prices[HAIKU].input) + 1;
  const f = (async () => {
    calls += 1;
    return Response.json({ stop_reason: "tool_use", usage: { input_tokens: big, output_tokens: 1 }, content: [{ type: "tool_use", id: `t${calls}`, name: "briefing", input: {} }] });
  }) as unknown as typeof fetch;
  const out = await runTurn([{ role: "user", content: "brief me" }], { db: fx.db, email: OWNER, env: { ANTHROPIC_API_KEY: "test" }, fetchImpl: f, now: Date.now() });
  assert.equal(calls, 1);
  assert.match(out.reply, /spending cap/);
});
