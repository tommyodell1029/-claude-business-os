import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { parseMessages, runTurn } from "./brain.ts";
import { startOfDayIso } from "./db.ts";
import { anthropicKey, model } from "./models.ts";
import { MODELS_CONFIG } from "./models.generated.ts";
import { audioType, speakable, voiceId, DEFAULT_VOICE_ID } from "./speech.ts";
import { briefing } from "./status.ts";
import { fakeDb, OWNER } from "./testkit.ts";
import { TOOLS, anthropicTools, runTool, validateToolInput } from "./tools.ts";

test("tool input validation rejects anything outside the fixed shape", () => {
  assert.equal(validateToolInput("drop_table", {}).ok, false);
  assert.equal(validateToolInput("query_calls", { sql: "select 1" }).ok, false, "unknown field");
  assert.equal(validateToolInput("query_calls", { limit: 0 }).ok, false);
  assert.equal(validateToolInput("query_calls", { limit: 21 }).ok, false);
  assert.equal(validateToolInput("query_calls", { limit: "5" }).ok, false);
  assert.equal(validateToolInput("query_calls", { limit: 2.5 }).ok, false);
  assert.equal(validateToolInput("query_calls", { urgency: "critical" }).ok, false);
  assert.equal(validateToolInput("query_calls", { client_slug: "demo'; drop table calls;--" }).ok, false);
  assert.equal(validateToolInput("query_prospects", { status: "new,or(1.eq.1)" }).ok, false);
  assert.equal(validateToolInput("outreach_review", { event_id: "not-a-uuid", decision: "approve" }).ok, false);
  assert.equal(validateToolInput("outreach_review", { event_id: "11111111-1111-4111-8111-111111111111", decision: "send" }).ok, false);
  assert.equal(validateToolInput("outreach_review", { decision: "approve" }).ok, false, "required field");
  assert.equal(validateToolInput("memory_add", { note: "   " }).ok, false);
  assert.equal(validateToolInput("memory_add", { note: "x".repeat(1001) }).ok, false);
  assert.equal(validateToolInput("briefing", []).ok, false);
  const ok = validateToolInput("memory_add", { note: "  call Bob\u0007 back  " });
  assert.ok(ok.ok && ok.value.note === "call Bob back");
  const q = validateToolInput("query_calls", { urgency: "urgent", client_slug: "demo", limit: 5, since_hours: 48 });
  assert.ok(q.ok);
});

test("no tool can send, call, delete, touch DNS or Stripe, or run SQL", () => {
  const names = TOOLS.map((t) => t.name).join(" ");
  assert.doesNotMatch(names, /send|call_out|dial|delete|dns|stripe|sql|confirm/i);
  assert.deepEqual(TOOLS.filter((t) => t.kind === "write").map((t) => t.name).sort(), [
    "create_experiment", "kill_opportunity", "memory_add", "outreach_review", "radar_sweep", "record_revenue", "research_opportunity", "set_experiment_status", "social_radar", "sync_gumroad_sales",
  ]);
  for (const t of anthropicTools()) assert.equal(t.input_schema.additionalProperties, false);
});

test("invalid input never reaches the database", async () => {
  const fx = fakeDb();
  const r = await runTool("query_calls", { limit: 999 }, { db: fx.db, email: OWNER, env: {}, fetchImpl: fetch, now: Date.now() });
  assert.match(JSON.stringify(r.content), /invalid input/);
  assert.equal(fx.log.length, 0);
});

test("briefing with no database reports null (data unavailable), never a number", async () => {
  const b = await briefing({ db: null, email: OWNER, env: {}, fetchImpl: fetch, now: Date.parse("2026-10-06T12:00:00Z") });
  assert.equal(b.calls, null);
  assert.equal(b.urgent_calls, null);
  assert.equal(b.new_website_leads, null);
  assert.equal(b.outreach_drafts_awaiting_approval, null);
  assert.equal(b.outreach_replies, null);
  assert.equal(b.calendar, null);
  assert.ok(b.health && b.health.checks.every((c) => c.status === "unavailable"));
});

test("model id comes from config/models.yaml and the jarvis role allow-list is enforced", () => {
  const src = new URL("../../../config/models.yaml", import.meta.url);
  if (existsSync(src)) assert.deepEqual(MODELS_CONFIG, parse(readFileSync(src, "utf8")), "run npm run build to resync models.generated.ts");
  assert.equal(model("small", "jarvis"), MODELS_CONFIG.models.small);
  assert.throws(() => model("audit", "jarvis"), /may not use/);
  assert.throws(() => model("small", "unknown"), /may not use/);
  assert.equal(anthropicKey({ LP_ANTHROPIC_API_KEY: " k2 " }), "k2");
  assert.equal(anthropicKey({ ANTHROPIC_API_KEY: "k1", LP_ANTHROPIC_API_KEY: "k2" }), "k1");
  assert.equal(anthropicKey({}), null);
});

test("start of day in America/New_York", () => {
  const now = new Date("2026-10-03T15:00:00Z"); // 11:00 EDT
  assert.equal(startOfDayIso("America/New_York", now), "2026-10-03T04:00:00.000Z");
  assert.equal(startOfDayIso("America/New_York", now, 1), "2026-10-02T04:00:00.000Z");
  assert.equal(startOfDayIso("America/New_York", new Date("2026-12-10T03:00:00Z")), "2026-12-09T05:00:00.000Z"); // 22:00 EST previous day
});

test("chat history validation", () => {
  assert.equal(parseMessages({}), null);
  assert.equal(parseMessages({ messages: [{ role: "system", content: "x" }] }), null);
  assert.equal(parseMessages({ messages: [{ role: "assistant", content: "hi" }] }), null);
  const m = parseMessages({ messages: [{ role: "assistant", content: "hello" }, { role: "user", content: "a" }, { role: "user", content: "b" }] });
  assert.deepEqual(m, [{ role: "user", content: "a\nb" }]);
  assert.equal(parseMessages({ messages: Array(41).fill({ role: "user", content: "x" }) }), null);
});

test("a model turn that calls a write tool returns a pending action, not a done action", async () => {
  const fx = fakeDb({ outreach_events: [{ id: "11111111-1111-4111-8111-111111111111", prospect_id: "p", step: 0, review_status: "pending", subject: "S", payload: { to: "a@b.example" } }] });
  const bodies: Record<string, unknown>[] = [];
  let round = 0;
  const f = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    round += 1;
    if (round === 1) {
      return Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "outreach_review", input: { event_id: "11111111-1111-4111-8111-111111111111", decision: "approve" } }] });
    }
    return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: "Shall I approve it, sir?" }] });
  }) as unknown as typeof fetch;
  const out = await runTurn([{ role: "user", content: "approve the plumbing draft" }], { db: fx.db, email: OWNER, env: { ANTHROPIC_API_KEY: "test" }, fetchImpl: f, now: Date.now() });
  assert.ok(out.pending);
  assert.equal(out.reply, "Shall I approve it, sir?");
  assert.equal(fx.tables.outreach_events[0].review_status, "pending");
  assert.equal(bodies[0].model, MODELS_CONFIG.models.small);
  assert.match(String(bodies[0].system), /ULTRON/);
});

test("speech helpers: audio type allow-list, speakable text, voice fallback", () => {
  assert.equal(audioType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(audioType("audio/mp4"), "audio/mp4");
  assert.equal(audioType("text/html"), null);
  assert.equal(audioType(null), null);
  assert.equal(speakable("  **Good** morning,\n sir  "), "Good morning, sir");
  assert.equal(speakable(""), null);
  assert.equal(speakable(5), null);
  assert.equal(speakable("x".repeat(5000))!.length, 1200);
  assert.equal(voiceId({ JARVIS_VOICE_ID: "abcDEF1234567890" }), "abcDEF1234567890");
  assert.equal(voiceId({}), DEFAULT_VOICE_ID);
  assert.equal(voiceId({ JARVIS_VOICE_ID: "../../etc" }), DEFAULT_VOICE_ID);
});
