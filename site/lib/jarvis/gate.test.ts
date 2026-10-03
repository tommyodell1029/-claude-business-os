import { test } from "node:test";
import assert from "node:assert/strict";
import { handleConfirm } from "./confirm.ts";
import { parseConfirmation } from "./confirmWords.ts";
import { CONFIRM_TTL_MS, checkGate, parseConfirmRequest } from "./gate.ts";
import type { ActionRow } from "./gate.ts";
import { fakeDb, OWNER } from "./testkit.ts";
import { runTool } from "./tools.ts";
import type { ToolCtx } from "./tools.ts";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-06T13:00:00Z");

function setup() {
  const fx = fakeDb({
    outreach_events: [{ id: DRAFT_ID, prospect_id: "p1", step: 0, event_type: "drafted", review_status: "pending", subject: "Calls after hours", platform: "gmail", payload: { to: "info@biz.example" } }],
    suppression: [],
  });
  const ctx = (now = T0): ToolCtx => ({ db: fx.db, email: OWNER, env: {}, fetchImpl: fetch, now });
  return { ...fx, ctx };
}

async function propose(s: ReturnType<typeof setup>) {
  const r = await runTool("outreach_review", { event_id: DRAFT_ID, decision: "approve" }, s.ctx());
  assert.ok(r.pending, "write tool returns a pending action");
  return r.pending!;
}

test("a write tool only proposes: nothing changes until confirmed", async () => {
  const s = setup();
  const p = await propose(s);
  assert.equal(s.tables.outreach_events[0].review_status, "pending");
  assert.equal(s.tables.outreach_events.length, 1);
  const a = s.tables.jarvis_actions[0];
  assert.equal(a.status, "proposed");
  assert.equal(a.actor_email, OWNER);
  assert.equal(Date.parse(String(a.expires_at)) - T0, CONFIRM_TTL_MS);
  assert.match(p.summary, /does not send/);
});

test("confirm with the matching id executes exactly once", async () => {
  const s = setup();
  const p = await propose(s);
  const out = await handleConfirm({ actionId: p.id, decision: "confirm", via: "tap" }, s.ctx(T0 + 30_000));
  assert.equal(out.status, "executed");
  assert.equal(s.tables.outreach_events[0].review_status, "approved");
  assert.equal(s.tables.outreach_events.filter((e) => e.event_type === "approved").length, 1);
  assert.equal(s.tables.jarvis_actions[0].status, "executed");
  assert.equal(s.tables.jarvis_actions[0].decided_via, "tap");
  const again = await handleConfirm({ actionId: p.id, decision: "confirm", via: "voice" }, s.ctx(T0 + 31_000));
  assert.equal(again.ok, false);
  assert.equal(s.tables.outreach_events.filter((e) => e.event_type === "approved").length, 1, "no second execution");
});

test("no execution without a matching id", async () => {
  const s = setup();
  await propose(s);
  const out = await handleConfirm({ actionId: "99999999-9999-4999-8999-999999999999", decision: "confirm", via: "voice" }, s.ctx());
  assert.equal(out.ok, false);
  assert.equal(s.tables.outreach_events[0].review_status, "pending");
});

test("expired actions never execute and are marked expired", async () => {
  const s = setup();
  const p = await propose(s);
  const out = await handleConfirm({ actionId: p.id, decision: "confirm", via: "voice" }, s.ctx(T0 + CONFIRM_TTL_MS + 1));
  assert.equal(out.status, "expired");
  assert.equal(s.tables.outreach_events[0].review_status, "pending");
  assert.equal(s.tables.jarvis_actions[0].status, "expired");
});

test("reject records the decision and executes nothing", async () => {
  const s = setup();
  const p = await propose(s);
  const out = await handleConfirm({ actionId: p.id, decision: "reject", via: "voice" }, s.ctx());
  assert.equal(out.status, "rejected");
  assert.equal(s.tables.jarvis_actions[0].status, "rejected");
  assert.equal(s.tables.outreach_events[0].review_status, "pending");
});

test("approval is refused for a suppressed recipient", async () => {
  const s = setup();
  s.tables.suppression.push({ email: "info@biz.example", reason: "unsubscribe" });
  const p = await propose(s);
  const out = await handleConfirm({ actionId: p.id, decision: "confirm", via: "tap" }, s.ctx());
  assert.equal(out.status, "failed");
  assert.equal(s.tables.outreach_events[0].review_status, "pending");
  assert.equal(s.tables.jarvis_actions[0].status, "failed");
});

test("memory_add saves only after confirmation", async () => {
  const s = setup();
  const r = await runTool("memory_add", { note: "Prefer briefings before 8 AM.", kind: "preference" }, s.ctx());
  assert.equal((s.tables.jarvis_memory ?? []).length, 0);
  await handleConfirm({ actionId: r.pending!.id, decision: "confirm", via: "voice" }, s.ctx());
  assert.equal(s.tables.jarvis_memory.length, 1);
  assert.equal(s.tables.jarvis_memory[0].kind, "preference");
});

test("checkGate covers id, owner, status and expiry", () => {
  const a: ActionRow = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tool: "memory_add", status: "proposed", actor_email: OWNER, summary: "", payload: {}, expires_at: new Date(T0 + 1000).toISOString() };
  const req = { actionId: a.id, decision: "confirm" as const, via: "tap" as const };
  assert.deepEqual(checkGate(a, req, OWNER, T0), { ok: true });
  assert.equal(checkGate(null, req, OWNER, T0).ok, false);
  assert.deepEqual(checkGate(a, { ...req, actionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, OWNER, T0), { ok: false, reason: "id_mismatch" });
  assert.deepEqual(checkGate(a, req, "other@example.com", T0), { ok: false, reason: "wrong_owner" });
  assert.deepEqual(checkGate({ ...a, status: "executed" }, req, OWNER, T0), { ok: false, reason: "not_pending" });
  assert.deepEqual(checkGate(a, req, OWNER, T0 + 1000), { ok: false, reason: "expired" });
});

test("confirm request validation", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.ok(parseConfirmRequest({ actionId: id, decision: "confirm", via: "tap" }));
  assert.equal(parseConfirmRequest({ actionId: "x", decision: "confirm", via: "tap" }), null);
  assert.equal(parseConfirmRequest({ actionId: id, decision: "yes", via: "tap" }), null);
  assert.equal(parseConfirmRequest({ actionId: id, decision: "confirm", via: "model" }), null);
  assert.equal(parseConfirmRequest(null), null);
});

test("spoken confirmation must be short and explicit", () => {
  for (const s of ["yes", "Yes.", "Yes, sir.", "Confirm", "Jarvis, do it.", "go ahead please"]) assert.equal(parseConfirmation(s), "confirm", s);
  for (const s of ["No.", "cancel", "No, cancel that... never mind"].slice(0, 2)) assert.equal(parseConfirmation(s), "reject", s);
  for (const s of ["yes but change the subject first", "approve the draft", "what does it say?", "", "yes ".repeat(30)]) assert.equal(parseConfirmation(s), null, s);
});
