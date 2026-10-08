// Jarvis/ULTRON tools. Read tools run freely; write tools only create a pending action (see gate.ts).
// Every input is validated against a fixed shape (unknown keys rejected) and every query is a fixed PostgREST
// select with validated values. Never: send email, place calls, touch DNS or Stripe, delete anything.
// Money OS tools (slice 5) reuse lib/os/*: ranking, scoring and budgets stay in code, never the model.
import type { Db } from "./db.ts";
import { hoursAgoIso } from "./db.ts";
import { expiresAt, isUuid } from "./gate.ts";
import { OS_CONFIG } from "../os/config.generated.ts";

export type ToolCtx = { db: Db | null; email: string; env: Record<string, string | undefined>; fetchImpl: typeof fetch; now: number };
export type ToolResult = { content: unknown; pending?: PendingAction };
export type PendingAction = { id: string; tool: string; summary: string; expiresAt: string };

const CALL_URGENCY = ["normal", "urgent"] as const;
const PROSPECT_STATUS = ["new", "researched", "no_email", "below_threshold", "queued", "in_sequence", "replied", "interested", "not_now", "not_interested", "unsubscribed", "bounced", "do_not_contact"] as const;
const REVIEW_STATUS = ["pending", "approved", "skipped", "sent"] as const;
const EVENT_TYPE = ["drafted", "approved", "edited", "skipped", "sent", "reply", "bounce", "unsubscribe", "complaint", "paused"] as const;
const CLIENT_STATUS = ["onboarding", "live", "paused", "ended"] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const OPP_STATUS = ["discovered", "researched", "validation_ready", "validating", "validated", "building", "live", "growing", "killed"] as const;
const EXP_STATUS = ["validation_ready", "validating", "validated", "building", "live", "growing", "killed"] as const;
const REVENUE_SOURCE = ["manual", "affiliate", "marketplace", "other"] as const; // Stripe revenue is read from payments, never typed in
const RADAR_KEYS = Object.keys((OS_CONFIG as unknown as { radar: { categories: Record<string, string> } }).radar.categories);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Field =
  | { type: "integer"; min: number; max: number; description: string }
  | { type: "enum"; values: readonly string[]; description: string }
  | { type: "slug"; description: string }
  | { type: "uuid"; description: string }
  | { type: "text"; min: number; max: number; description: string }
  | { type: "number"; min: number; max: number; description: string }
  | { type: "date"; description: string };

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
  { name: "top_opportunities", kind: "read", description: "Money OS opportunities ranked by the code-computed score (killed ones left out unless asked for by status), with confidence and labels (HIGH SCORE, STRONG EVIDENCE, FAST VALIDATION). A null score means not researched yet.", fields: { status: { type: "enum", values: OPP_STATUS, description: "Only opportunities with this status." }, limit }, required: [] },
  { name: "opportunity_detail", kind: "read", description: "One Money OS opportunity: sub-scores with their reasons, what drives the score, unknown dimensions, and up to ten evidence claims with their source domains.", fields: { opportunity_id: { type: "uuid", description: "The opportunity id from top_opportunities." } }, required: ["opportunity_id"] },
  { name: "query_experiments", kind: "read", description: "Money OS experiments, newest first: name, status, hypothesis, success metric, target, budget and result note.", fields: { status: { type: "enum", values: EXP_STATUS, description: "Only experiments with this status." }, limit }, required: [] },
  { name: "revenue_summary", kind: "read", description: "Revenue, cost and profit by venture: live Stripe payments (test-mode excluded) plus recorded revenue entries, with this month's total.", fields: {}, required: [] },
  { name: "ai_cost_summary", kind: "read", description: "AI spend from the usage ledger: today, this month, the daily budget meter, and spend by task and by opportunity.", fields: {}, required: [] },
  { name: "what_next", kind: "read", description: "What needs the owner's attention in the Money OS, ranked by code: experiments waiting on a decision, the best scored opportunities, unresearched opportunities with the most evidence, and today's remaining AI budget.", fields: {}, required: [] },
  { name: "radar_sweep", kind: "write", description: "Propose a Money Radar web search for new opportunities in one category. It costs money (web searches plus tokens, within the AI budgets), so it does NOT run until the owner confirms. A recent identical sweep is reused for free.", fields: { category: { type: "enum", values: RADAR_KEYS, description: "The Radar category." } }, required: ["category"] },
  { name: "research_opportunity", kind: "write", description: "Propose web research on one opportunity (evidence plus proposed sub-scores; the score itself is computed in code). Costs money, so it does NOT run until the owner confirms. Results from the last 14 days are reused for free unless fresh is yes.", fields: { opportunity_id: { type: "uuid", description: "The opportunity id." }, fresh: { type: "enum", values: ["yes", "no"], description: "yes to ignore a recent cached result (default no)." } }, required: ["opportunity_id"] },
  { name: "create_experiment", kind: "write", description: "Propose a new Money OS experiment (status validating). Does NOT execute until the owner confirms. Use only details the owner gave; never invent targets or budgets.", fields: { name: { type: "text", min: 1, max: 160, description: "Short experiment name." }, opportunity_id: { type: "uuid", description: "The opportunity it tests, if any." }, hypothesis: { type: "text", min: 1, max: 1000, description: "What we believe will happen." }, success_metric: { type: "text", min: 1, max: 300, description: "How success is measured." }, target: { type: "text", min: 1, max: 300, description: "The number that counts as success." }, budget_usd: { type: "number", min: 0, max: 10000, description: "Money budget in USD (default 0)." } }, required: ["name"] },
  { name: "set_experiment_status", kind: "write", description: "Propose changing an experiment's status, with an optional result note. Does NOT execute until the owner confirms.", fields: { experiment_id: { type: "uuid", description: "The experiment id from query_experiments." }, status: { type: "enum", values: EXP_STATUS, description: "The new status." }, result_note: { type: "text", min: 1, max: 2000, description: "What happened, in plain English." } }, required: ["experiment_id", "status"] },
  { name: "kill_opportunity", kind: "write", description: "Propose marking an opportunity as killed (it stays stored, hidden from the ranking). Does NOT execute until the owner confirms.", fields: { opportunity_id: { type: "uuid", description: "The opportunity id." }, reason: { type: "text", min: 1, max: 500, description: "Why it is being killed." } }, required: ["opportunity_id", "reason"] },
  { name: "record_revenue", kind: "write", description: "Propose recording revenue the owner reports (not Stripe; Stripe payments are counted automatically). Does NOT execute until the owner confirms. Use only amounts the owner stated.", fields: { venture: { type: "text", min: 1, max: 80, description: "Which venture earned it." }, amount_usd: { type: "number", min: 0, max: 100000, description: "Amount received in USD." }, cost_usd: { type: "number", min: 0, max: 100000, description: "Direct cost in USD (default 0)." }, source: { type: "enum", values: REVENUE_SOURCE, description: "manual, affiliate, marketplace or other." }, occurred_on: { type: "date", description: "Date received, YYYY-MM-DD (default today)." }, product: { type: "text", min: 1, max: 160, description: "What was sold." }, experiment_id: { type: "uuid", description: "The experiment it belongs to, if any." }, note: { type: "text", min: 1, max: 500, description: "Optional note." } }, required: ["venture", "amount_usd", "source"] },
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
          if (f.type === "number") return [k, { type: "number", minimum: f.min, maximum: f.max, description: f.description }];
          if (f.type === "date") return [k, { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: f.description }];
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
    } else if (f.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < f.min || v > f.max) return { ok: false, error: `${k} must be a number from ${f.min} to ${f.max}` };
      value[k] = Math.round(v * 100) / 100;
    } else if (f.type === "date") {
      if (typeof v !== "string" || !DATE_RE.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) return { ok: false, error: `${k} must be a date YYYY-MM-DD` };
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
    case "top_opportunities": {
      const items = await (await import("../os/opportunities.ts")).listRanked(db, { status: v.status ? String(v.status) : undefined, limit: lim(v) });
      return { opportunities: items.map((o) => ({ id: o.id, name: o.name, category: o.category, status: o.status, score: o.overall, confidence: o.confidence, labels: o.labels.text || null, evidence: o.evidenceCount, sources: o.domains })) };
    }
    case "opportunity_detail": {
      const d = await (await import("../os/views.ts")).opportunityDetail(db, String(v.opportunity_id));
      if (!d) return { error: "no opportunity with that id" };
      const ev = (d.evidence as Record<string, unknown>[]).slice(0, 10).map((e) => ({ kind: e.kind, claim: clip(e.claim, 300), source: e.source_domain ?? null }));
      return { ...d, problem: clip(d.problem, 400), evidence: ev, evidence_total: (d.evidence as unknown[]).length };
    }
    case "revenue_summary": {
      const r = await (await import("../os/views.ts")).revenueView(db, ctx.now);
      return r.ventures === null ? { error: "data unavailable: revenue could not be read" } : r;
    }
    case "ai_cost_summary": {
      const c = await (await import("../os/views.ts")).costView(db, ctx.now);
      if (c.today === null) return { error: "data unavailable: the AI usage ledger could not be read" };
      return { today: c.today, month: c.month, budget: c.budget, by_task: c.byTask, per_opportunity: c.perOpportunity?.slice(0, 5) };
    }
    case "what_next":
      return whatNext(db, ctx.now);
    case "query_experiments": {
      const f: [string, "eq", string][] = v.status ? [["status", "eq", String(v.status)]] : [];
      const rows = await db.select("experiments", "id,name,status,hypothesis,success_metric,target,budget_usd,result_note,started_at,ended_at,opportunity_id", f, "started_at.desc", lim(v));
      return { experiments: rows.map((r) => ({ ...r, hypothesis: clip(r.hypothesis, 400), result_note: clip(r.result_note, 400) })) };
    }
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
  } else if (name === "memory_add") {
    summary = `Save ${v.kind === "preference" ? "preference" : "note"}: "${clip(String(v.note), 300)}"`;
  } else {
    const s = await describeMoneyOs(name, v, db, ctx.now);
    if ("error" in s) return { content: { error: s.error } };
    summary = s.summary;
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

const OS_CFG = OS_CONFIG as unknown as { timezone: string; radar: { role: string; max_searches: number; max_tokens: number; categories: Record<string, string> }; research: { role: string; max_searches: number; max_tokens: number } };
const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
const todayLocal = (now: number) => new Intl.DateTimeFormat("en-CA", { timeZone: OS_CFG.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));

async function loadOne(db: Db, table: string, select: string, id: string): Promise<Record<string, unknown> | null> {
  return (await db.select<Record<string, unknown>>(table, select, [["id", "eq", id]], undefined, 1))[0] ?? null;
}

const DECISION_AFTER_DAYS = 7;

/** Attention list for the Money OS. Ordering and thresholds are code; the model only phrases the result. */
async function whatNext(db: Db, now: number) {
  const { listRanked } = await import("../os/opportunities.ts");
  const { effectiveConfig } = await import("../os/settings.ts");
  const { spentToday } = await import("../os/usage.ts");
  const cutoff = new Date(now - DECISION_AFTER_DAYS * 86_400_000).toISOString();
  const waiting = await db.select("experiments", "id,name,status,target,started_at", [["status", "eq", "validating"], ["started_at", "lte", cutoff]], "started_at.asc", 5);
  const ranked = await listRanked(db, { limit: 100 });
  const best = ranked.filter((o) => o.overall !== null).slice(0, 3);
  const unresearched = ranked.filter((o) => o.status === "discovered").sort((a, b) => b.evidenceCount - a.evidenceCount || b.domains - a.domains).slice(0, 3);
  const cfg = await effectiveConfig(db);
  const spent = await spentToday(db, now, cfg);
  return {
    experiments_needing_decision: waiting.map((e) => ({ ...e, note: `validating for more than ${DECISION_AFTER_DAYS} days: decide validated or killed` })),
    best_opportunities: best.map((o) => ({ id: o.id, name: o.name, score: o.overall, confidence: o.confidence, labels: o.labels.text || null, status: o.status })),
    research_next: unresearched.map((o) => ({ id: o.id, name: o.name, evidence: o.evidenceCount, sources: o.domains })),
    ai_budget_left_today: spent === null ? null : Math.max(0, Math.round((cfg.budgets.per_day_usd - spent) * 100) / 100),
  };
}

/** Checks a Money OS write against stored data and describes exactly what confirming will do. Executes nothing. */
async function describeMoneyOs(name: string, v: Record<string, string | number>, db: Db, now: number): Promise<{ summary: string } | { error: string }> {
  const { worstCase } = await import("../os/research.ts");
  const { model } = await import("./models.ts");
  if (name === "radar_sweep") {
    const R = OS_CFG.radar;
    const worst = worstCase(model(R.role, "os"), R.max_searches, R.max_tokens, 2000);
    return { summary: `Run Money Radar on ${R.categories[String(v.category)]}: up to ${R.max_searches} web searches, at most about ${money(worst)} (free if a sweep from the last 14 days exists).` };
  }
  if (name === "research_opportunity" || name === "kill_opportunity" || (name === "create_experiment" && v.opportunity_id)) {
    const o = await loadOne(db, "opportunities", "id,name,status", String(v.opportunity_id));
    if (!o) return { error: "no opportunity with that id" };
    if (name === "research_opportunity") {
      const RS = OS_CFG.research;
      const worst = worstCase(model(RS.role, "os"), RS.max_searches, RS.max_tokens, 3000);
      return { summary: `Research "${clip(o.name, 120)}" on the web: up to ${RS.max_searches} searches, at most about ${money(worst)}${v.fresh === "yes" ? " (fresh run, ignoring any cached result)" : " (free if researched in the last 14 days)"}.` };
    }
    if (name === "kill_opportunity") {
      if (o.status === "killed") return { error: "that opportunity is already killed" };
      return { summary: `Kill opportunity "${clip(o.name, 120)}" (status ${String(o.status)} to killed; it stays stored). Reason: ${clip(String(v.reason), 200)}` };
    }
    return { summary: `Create experiment "${clip(String(v.name), 120)}" for "${clip(o.name, 120)}", budget ${money(v.budget_usd)}${v.target ? `, target: ${clip(String(v.target), 120)}` : ""}.` };
  }
  if (name === "create_experiment") return { summary: `Create experiment "${clip(String(v.name), 120)}", budget ${money(v.budget_usd)}${v.target ? `, target: ${clip(String(v.target), 120)}` : ""}.` };
  if (name === "set_experiment_status") {
    const e = await loadOne(db, "experiments", "id,name,status", String(v.experiment_id));
    if (!e) return { error: "no experiment with that id" };
    if (e.status === v.status) return { error: `that experiment is already ${String(v.status)}` };
    return { summary: `Change experiment "${clip(e.name, 120)}" from ${String(e.status)} to ${String(v.status)}${v.result_note ? `. Note: ${clip(String(v.result_note), 200)}` : ""}.` };
  }
  if (name === "record_revenue") {
    const day = String(v.occurred_on ?? todayLocal(now));
    if (day > todayLocal(now)) return { error: "occurred_on cannot be in the future" };
    if (v.experiment_id && !(await loadOne(db, "experiments", "id", String(v.experiment_id)))) return { error: "no experiment with that id" };
    return { summary: `Record ${money(v.amount_usd)} revenue${v.cost_usd ? ` (cost ${money(v.cost_usd)})` : ""} for ${clip(String(v.venture), 80)} from ${String(v.source)} on ${day}${v.product ? `, product: ${clip(String(v.product), 80)}` : ""}.` };
  }
  return { error: `unknown write tool ${name}` };
}

/** Executes a confirmed Money OS action. Inputs are re-validated; ids are re-checked against the database. */
async function executeMoneyOs(tool: string, v: Record<string, string | number>, actionId: string, ctx: ToolCtx & { db: Db }): Promise<string> {
  const db = ctx.db;
  const { logActivity } = await import("../os/usage.ts");
  const stamp = new Date(ctx.now).toISOString();
  if (tool === "radar_sweep" || tool === "research_opportunity") {
    const research = await import("../os/research.ts");
    const rctx = { db, env: ctx.env, fetchImpl: ctx.fetchImpl, now: ctx.now };
    if (tool === "radar_sweep") {
      const r = await research.radarCategory(rctx, String(v.category));
      if (!r.ok) throw new Error(r.error ?? "radar failed");
      return `${r.cached ? "Reused a recent sweep: " : ""}${r.created} new opportunities, ${r.existing} already known, ${r.evidenceAdded} evidence items saved, ${r.evidenceDropped} unsupported claims dropped. Cost ${money(r.spentUsd)}.`;
    }
    const r = await research.researchOpportunity(rctx, String(v.opportunity_id), { force: v.fresh === "yes" });
    if (!r.ok) throw new Error(r.error ?? "research failed");
    return `${r.cached ? "Reused recent research: " : ""}${r.evidenceAdded} evidence items saved, ${r.evidenceDropped} unsupported claims dropped, ${r.scored} dimensions scored. Cost ${money(r.spentUsd)}.`;
  }
  if (tool === "create_experiment") {
    let opp: Record<string, unknown> | null = null;
    if (v.opportunity_id) {
      opp = await loadOne(db, "opportunities", "id,name,status", String(v.opportunity_id));
      if (!opp) throw new Error("opportunity no longer exists");
    }
    const row = await db.insert<{ id: string }>("experiments", {
      name: v.name, opportunity_id: v.opportunity_id ?? null, hypothesis: v.hypothesis ?? null, success_metric: v.success_metric ?? null,
      target: v.target ?? null, budget_usd: v.budget_usd ?? 0, status: "validating",
    });
    if (opp && ["discovered", "researched", "validation_ready"].includes(String(opp.status))) {
      await db.update("opportunities", [["id", "eq", String(opp.id)]], { status: "validating", updated_at: stamp });
    }
    await logActivity(db, "ultron", "experiment_created", `${String(v.name)} (action ${actionId}, experiment ${row.id})`);
    return "Experiment created and marked validating.";
  }
  if (tool === "set_experiment_status") {
    const e = await loadOne(db, "experiments", "id,name,status", String(v.experiment_id));
    if (!e) throw new Error("experiment no longer exists");
    const patch: Record<string, unknown> = { status: v.status, updated_at: stamp };
    if (v.result_note) patch.result_note = v.result_note;
    if (v.status === "killed") patch.ended_at = stamp;
    await db.update("experiments", [["id", "eq", String(e.id)]], patch);
    await logActivity(db, "ultron", "experiment_status", `${String(e.name)}: ${String(e.status)} -> ${String(v.status)} (action ${actionId})`);
    return `Experiment is now ${String(v.status)}.`;
  }
  if (tool === "kill_opportunity") {
    const o = await loadOne(db, "opportunities", "id,name,status", String(v.opportunity_id));
    if (!o) throw new Error("opportunity no longer exists");
    if (o.status === "killed") throw new Error("already killed");
    await db.update("opportunities", [["id", "eq", String(o.id)]], { status: "killed", updated_at: stamp });
    await logActivity(db, "ultron", "opportunity_killed", `${String(o.name)}: ${String(v.reason)} (action ${actionId})`);
    return "Opportunity killed. It stays stored and is hidden from the ranking.";
  }
  if (tool === "record_revenue") {
    const day = String(v.occurred_on ?? todayLocal(ctx.now));
    if (day > todayLocal(ctx.now)) throw new Error("occurred_on cannot be in the future");
    await db.insert("revenue_entries", {
      venture: v.venture, experiment_id: v.experiment_id ?? null, source: v.source, product: v.product ?? null,
      amount_usd: v.amount_usd, cost_usd: v.cost_usd ?? 0, occurred_on: day, note: v.note ?? null,
    });
    await logActivity(db, "owner", "revenue_recorded", `${money(v.amount_usd)} for ${String(v.venture)} on ${day} (action ${actionId})`);
    return `Recorded ${money(v.amount_usd)} for ${String(v.venture)}.`;
  }
  throw new Error(`unknown write tool ${tool}`);
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
  const v = validateToolInput(tool, payload);
  if (!v.ok) throw new Error(v.error);
  return executeMoneyOs(tool, v.value, actionId, { ...ctx, db });
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
