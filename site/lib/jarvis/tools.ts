// Jarvis tools. Read tools run freely; write tools only create a pending action (see gate.ts).
// Every input is validated against a fixed shape (unknown keys rejected) and every query is a fixed PostgREST
// select with validated values. Never: send email, place calls, touch DNS or Stripe.
import type { Db } from "./db.ts";
import { hoursAgoIso } from "./db.ts";
import { expiresAt, isUuid } from "./gate.ts";

export type ToolCtx = { db: Db | null; email: string; env: Record<string, string | undefined>; fetchImpl: typeof fetch; now: number };
export type ToolResult = { content: unknown; pending?: PendingAction };
export type PendingAction = { id: string; tool: string; summary: string; expiresAt: string };

const CALL_URGENCY = ["normal", "urgent"] as const;
const PROSPECT_STATUS = ["new", "researched", "no_email", "below_threshold", "queued", "in_sequence", "replied", "interested", "not_now", "not_interested", "unsubscribed", "bounced", "do_not_contact"] as const;
const REVIEW_STATUS = ["pending", "approved", "skipped", "sent"] as const;
const EVENT_TYPE = ["drafted", "approved", "edited", "skipped", "sent", "reply", "bounce", "unsubscribe", "complaint", "paused"] as const;
const CLIENT_STATUS = ["onboarding", "live", "paused", "ended"] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

type Field =
  | { type: "integer"; min: number; max: number; description: string }
  | { type: "enum"; values: readonly string[]; description: string }
  | { type: "slug"; description: string }
  | { type: "uuid"; description: string }
  | { type: "text"; min: number; max: number; description: string };

type ToolSpec = { name: string; kind: "read" | "write"; description: string; fields: Record<string, Field>; required: string[] };

const limit: Field = { type: "integer", min: 1, max: 20, description: "Maximum rows to return (1-20, default 10)." };
const sinceHours = (d: number): Field => ({ type: "integer", min: 1, max: 2160, description: `How many hours back to look (1-2160, default ${d}).` });

export const TOOLS: ToolSpec[] = [
  { name: "briefing", kind: "read", description: "The owner's briefing: calls since yesterday, urgent calls, new website leads, outreach drafts awaiting approval, outreach replies, and system health. Null values mean data unavailable.", fields: {}, required: [] },
  { name: "query_calls", kind: "read", description: "Recent calls answered by the client voice receptionists, newest first.", fields: { since_hours: sinceHours(24), urgency: { type: "enum", values: CALL_URGENCY, description: "Only calls with this urgency." }, client_slug: { type: "slug", description: "Only calls for this client slug." }, limit }, required: [] },
  { name: "query_site_leads", kind: "read", description: "Contact-form leads from the LaunchPad Local website, newest first.", fields: { since_hours: sinceHours(168), limit }, required: [] },
  { name: "query_prospects", kind: "read", description: "Lead-generation prospects, highest score first.", fields: { status: { type: "enum", values: PROSPECT_STATUS, description: "Only prospects with this status." }, min_score: { type: "integer", min: 0, max: 100, description: "Minimum score (0-100)." }, limit }, required: [] },
  { name: "query_outreach", kind: "read", description: "Outreach email events (drafts, approvals, sends, replies), newest first. Pending drafts include their body so they can be read to the owner.", fields: { review_status: { type: "enum", values: REVIEW_STATUS, description: "Only rows with this review status (pending = awaiting the owner's approval)." }, event_type: { type: "enum", values: EVENT_TYPE, description: "Only rows of this event type." }, since_hours: sinceHours(720), limit }, required: [] },
  { name: "query_clients", kind: "read", description: "LaunchPad Local's clients.", fields: { status: { type: "enum", values: CLIENT_STATUS, description: "Only clients with this status." } }, required: [] },
  { name: "diagnostics", kind: "read", description: "Runs a health check: database, last call saved, website, Resend email domains, Pipecat voice agent and Twilio demo number. Checks without credentials report unavailable.", fields: {}, required: [] },
  { name: "memory_recall", kind: "read", description: "The owner's saved notes and preferences, newest first.", fields: { limit }, required: [] },
  { name: "outreach_review", kind: "write", description: "Propose approving or skipping one pending outreach draft. Does NOT execute: it creates a pending action the owner must confirm by saying yes or tapping Confirm within two minutes. Approving never sends the email; sending stays a separate owner step.", fields: { event_id: { type: "uuid", description: "The id of the pending draft row from query_outreach." }, decision: { type: "enum", values: ["approve", "skip"], description: "approve or skip." } }, required: ["event_id", "decision"] },
  { name: "memory_add", kind: "write", description: "Propose saving a note or preference for the owner. Does NOT execute until the owner confirms.", fields: { note: { type: "text", min: 1, max: 1000, description: "The note, in plain English." }, kind: { type: "enum", values: ["note", "preference"], description: "note (default) or preference." } }, required: ["note"] },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));
export const isWriteTool = (name: string): boolean => byName.get(name)?.kind === "write";

/** Anthropic Messages API tool definitions. */
export function anthropicTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: t.required,
      properties: Object.fromEntries(
        Object.entries(t.fields).map(([k, f]) => {
          if (f.type === "integer") return [k, { type: "integer", minimum: f.min, maximum: f.max, description: f.description }];
          if (f.type === "enum") return [k, { type: "string", enum: [...f.values], description: f.description }];
          if (f.type === "text") return [k, { type: "string", minLength: f.min, maxLength: f.max, description: f.description }];
          return [k, { type: "string", description: f.description }];
        }),
      ),
    },
  }));
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export type Validated = { ok: true; value: Record<string, string | number> } | { ok: false; error: string };

export function validateToolInput(name: string, input: unknown): Validated {
  const spec = byName.get(name);
  if (!spec) return { ok: false, error: `unknown tool ${JSON.stringify(name)}` };
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "input must be an object" };
  const inp = input as Record<string, unknown>;
  for (const k of Object.keys(inp)) if (!(k in spec.fields)) return { ok: false, error: `unexpected field ${JSON.stringify(k)}` };
  for (const k of spec.required) if (inp[k] === undefined || inp[k] === null) return { ok: false, error: `missing ${k}` };
  const value: Record<string, string | number> = {};
  for (const [k, f] of Object.entries(spec.fields)) {
    const v = inp[k];
    if (v === undefined || v === null) continue;
    if (f.type === "integer") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < f.min || v > f.max) return { ok: false, error: `${k} must be an integer from ${f.min} to ${f.max}` };
      value[k] = v;
    } else if (f.type === "enum") {
      if (typeof v !== "string" || !f.values.includes(v)) return { ok: false, error: `${k} must be one of ${f.values.join(", ")}` };
      value[k] = v;
    } else if (f.type === "slug") {
      if (typeof v !== "string" || !SLUG_RE.test(v)) return { ok: false, error: `${k} is not a valid client slug` };
      value[k] = v;
    } else if (f.type === "uuid") {
      if (!isUuid(v)) return { ok: false, error: `${k} must be a uuid` };
      value[k] = v.toLowerCase();
    } else {
      if (typeof v !== "string") return { ok: false, error: `${k} must be text` };
      const t = v.replace(CONTROL, "").trim();
      if (t.length < f.min || t.length > f.max) return { ok: false, error: `${k} must be ${f.min}-${f.max} characters` };
      value[k] = t;
    }
  }
  return { ok: true, value };
}

const clip = (s: unknown, n: number): string | null => (typeof s === "string" ? (s.length > n ? `${s.slice(0, n)}…` : s) : null);
const lim = (v: Record<string, string | number>) => Number(v.limit ?? 10);
const UNAVAILABLE = "data unavailable: database is not configured";

async function readTool(name: string, v: Record<string, string | number>, ctx: ToolCtx): Promise<unknown> {
  // Late imports keep this module light for tests that only validate input.
  if (name === "briefing") return (await import("./status.ts")).briefing(ctx);
  if (name === "diagnostics") return (await import("./diagnostics.ts")).diagnostics(ctx);
  const db = ctx.db;
  if (!db) return { error: UNAVAILABLE };
  switch (name) {
    case "query_calls": {
      const f: [string, "eq" | "gte", string][] = [["created_at", "gte", hoursAgoIso(Number(v.since_hours ?? 24), ctx.now)]];
      if (v.urgency) f.push(["urgency", "eq", String(v.urgency)]);
      if (v.client_slug) f.push(["client_slug", "eq", String(v.client_slug)]);
      const rows = await db.select("calls", "id,client_slug,caller_name,caller_phone,intent,urgency,summary,transferred,end_reason,created_at", f, "created_at.desc", lim(v));
      return { calls: rows.map((r) => ({ ...r, summary: clip(r.summary, 400) })) };
    }
    case "query_site_leads": {
      const rows = await db.select("site_leads", "id,name,business,email,phone,message,created_at", [["created_at", "gte", hoursAgoIso(Number(v.since_hours ?? 168), ctx.now)]], "created_at.desc", lim(v));
      return { leads: rows.map((r) => ({ ...r, message: clip(r.message, 400) })) };
    }
    case "query_prospects": {
      const f: [string, "eq" | "gte", string | number][] = [];
      if (v.status) f.push(["status", "eq", String(v.status)]);
      if (v.min_score !== undefined) f.push(["score", "gte", Number(v.min_score)]);
      const rows = await db.select("prospects", "id,name,industry,city,website,score,status,created_at", f, "score.desc.nullslast", lim(v));
      return { prospects: rows };
    }
    case "query_outreach": {
      const f: [string, "eq" | "gte", string][] = [["created_at", "gte", hoursAgoIso(Number(v.since_hours ?? 720), ctx.now)]];
      if (v.review_status) f.push(["review_status", "eq", String(v.review_status)]);
      if (v.event_type) f.push(["event_type", "eq", String(v.event_type)]);
      const rows = await db.select("outreach_events", "id,prospect_id,step,event_type,review_status,subject,body,classification,created_at,to:payload->>to", f, "created_at.desc", lim(v));
      return { events: rows.map((r) => ({ ...r, body: r.review_status === "pending" ? clip(r.body, 1200) : undefined })) };
    }
    case "query_clients": {
      const f: [string, "eq", string][] = v.status ? [["status", "eq", String(v.status)]] : [];
      return { clients: await db.select("clients", "slug,business_name,industry,status,created_at", f, "created_at.desc", 50) };
    }
    case "memory_recall":
      return { notes: await db.select("jarvis_memory", "id,kind,note,created_at", [], "created_at.desc", lim(v)) };
  }
  return { error: `unknown read tool ${name}` };
}

type Draft = { id: string; prospect_id: string; step: number; event_type: string; review_status: string | null; subject: string | null; platform: string | null; to: string | null };

async function loadDraft(db: Db, id: string): Promise<Draft | null> {
  const rows = await db.select<Draft>("outreach_events", "id,prospect_id,step,event_type,review_status,subject,platform,to:payload->>to", [["id", "eq", id]], undefined, 1);
  return rows[0] ?? null;
}

/** Write tool called by the model: validate, describe, and store as `proposed`. Executes nothing. */
async function proposeWrite(name: string, v: Record<string, string | number>, ctx: ToolCtx): Promise<ToolResult> {
  const db = ctx.db;
  if (!db) return { content: { error: UNAVAILABLE } };
  let summary: string;
  if (name === "outreach_review") {
    const d = await loadDraft(db, String(v.event_id));
    if (!d) return { content: { error: "no outreach row with that id" } };
    if (d.review_status !== "pending") return { content: { error: `that draft is not awaiting approval (status: ${d.review_status ?? "none"})` } };
    summary = `${v.decision === "approve" ? "Approve" : "Skip"} outreach draft to ${d.to ?? "unknown recipient"}: "${clip(d.subject ?? "(no subject)", 120)}". Approval does not send it.`;
  } else {
    summary = `Save ${v.kind === "preference" ? "preference" : "note"}: "${clip(String(v.note), 300)}"`;
  }
  const row = await db.insert<{ id: string; expires_at: string }>("jarvis_actions", {
    tool: name,
    status: "proposed",
    actor_email: ctx.email,
    summary: summary.slice(0, 500),
    payload: v,
    expires_at: expiresAt(ctx.now),
  });
  const pending = { id: row.id, tool: name, summary, expiresAt: row.expires_at };
  return {
    content: { pending_action_id: row.id, summary, expires_in_seconds: 120, status: "awaiting the owner's confirmation; you cannot confirm it yourself" },
    pending,
  };
}

/** Runs a confirmed action. Called only by the confirm route after the gate has claimed the row. */
export async function executeWrite(tool: string, payload: Record<string, unknown>, actionId: string, ctx: ToolCtx): Promise<string> {
  const db = ctx.db;
  if (!db) throw new Error("database not configured");
  if (tool === "memory_add") {
    const v = validateToolInput("memory_add", payload);
    if (!v.ok) throw new Error(v.error);
    await db.insert("jarvis_memory", { kind: v.value.kind ?? "note", note: v.value.note, created_by: ctx.email, action_id: actionId });
    return "Note saved.";
  }
  if (tool === "outreach_review") {
    const v = validateToolInput("outreach_review", payload);
    if (!v.ok) throw new Error(v.error);
    const d = await loadDraft(db, String(v.value.event_id));
    if (!d || d.review_status !== "pending") throw new Error("draft is no longer awaiting approval");
    const approve = v.value.decision === "approve";
    if (approve && d.to) {
      const suppressed = await db.select("suppression", "email", [["email", "eq", d.to.trim().toLowerCase()]], undefined, 1);
      if (suppressed.length) throw new Error("recipient is on the suppression list; draft not approved");
    }
    const status = approve ? "approved" : "skipped";
    const updated = await db.update("outreach_events", [["id", "eq", d.id], ["review_status", "eq", "pending"]], { review_status: status });
    if (!updated.length) throw new Error("draft changed before it could be updated");
    await db.insert("outreach_events", {
      prospect_id: d.prospect_id,
      step: d.step,
      event_type: status,
      platform: d.platform,
      subject: d.subject,
      payload: { source: "jarvis", draft_id: d.id, action_id: actionId, by: ctx.email },
    });
    return approve ? "Draft approved. It has not been sent; sending remains a separate step." : "Draft skipped.";
  }
  throw new Error(`unknown write tool ${tool}`);
}

export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<ToolResult> {
  const v = validateToolInput(name, input);
  if (!v.ok) return { content: { error: `invalid input: ${v.error}` } };
  try {
    if (isWriteTool(name)) return await proposeWrite(name, v.value, ctx);
    return { content: await readTool(name, v.value, ctx) };
  } catch (e) {
    console.error(`jarvis tool ${name}: ${(e as Error).message}`);
    return { content: { error: "data unavailable: the lookup failed" } };
  }
}
