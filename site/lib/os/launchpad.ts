// Launchpad Local business module (owner 2026-10-13): the $499 one-page website offer, plumbing/HVAC first.
// Read-only business overview for /os and ULTRON, computed in code from prospects, outreach_events, client_projects
// and revenue_entries. No model call, nothing invented: a count that can't be read is null (shown as DATA UNAVAILABLE).
import type { Db } from "../jarvis/db.ts";

export const STAGES = ["identified", "researching", "qualified", "audit_prepared", "awaiting_approval", "contacted", "replied",
  "quote_prepared", "awaiting_payment", "won", "in_production", "delivered", "maintenance", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const VENTURE = "Launchpad Local websites";

type Row = Record<string, unknown>;
type Finding = { id: string; title: string; evidence: string; url: string | null; weight: number };

const safe = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type Lead = {
  id: string; name: string; industry: string; city: string | null; phone: string | null; website: string | null;
  email: string | null; stage: string; fit: number | null; notes: string | null; nextFollowUp: string | null;
  findings: Finding[]; verifiedInBrowser: boolean; contactPath: string;
};

function toLead(r: Row): Lead {
  const a = (r.website_audit ?? {}) as { findings?: Finding[]; verified_in_browser?: string };
  const email = (r.email as string | null) ?? null;
  const verified = r.email_verification_status === "verified";
  return {
    id: String(r.id), name: String(r.name), industry: String(r.industry ?? ""), city: (r.city as string | null) ?? null,
    phone: (r.phone as string | null) ?? null, website: (r.website as string | null) ?? null, email,
    stage: String(r.pipeline_stage), fit: typeof r.website_fit === "number" ? r.website_fit : null,
    notes: (r.qualification_notes as string | null) ?? null, nextFollowUp: (r.next_follow_up as string | null) ?? null,
    findings: Array.isArray(a.findings) ? a.findings : [], verifiedInBrowser: !!a.verified_in_browser,
    contactPath: email && verified ? "verified email" : email ? "email not verified (no first touch)" : r.phone ? "phone only (owner calls or visits)" : "no contact path yet",
  };
}

export async function launchpadOverview(db: Db, now: number) {
  const today = isoDay(now);
  const prospects = await safe(() => db.select<Row>("prospects",
    "id,name,industry,city,phone,website,email,email_verification_status,pipeline_stage,website_fit,qualification_notes,next_follow_up,website_audit,offer",
    [["offer", "eq", "website"]], "website_fit.desc.nullslast", 500));
  const projects = await safe(() => db.select<Row>("client_projects", "id,business,status,deposit_status,balance_status,price_usd,deploy_status,preview_url,updated_at", [], "updated_at.desc", 100));
  const revenue = await safe(() => db.select<{ amount_usd: number | string }>("revenue_entries", "amount_usd", [["venture", "eq", VENTURE]], undefined, 1000));
  const outreach = await safe(() => db.select<Row>("outreach_events", "event_type,review_status,payload", [["created_at", "gte", "2026-10-13T00:00:00Z"]], undefined, 2000));

  const byStage: Record<string, number> = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const p of prospects ?? []) byStage[String(p.pipeline_stage)] = (byStage[String(p.pipeline_stage)] ?? 0) + 1;
  const websiteOutreach = (outreach ?? []).filter((e) => (e.payload as Row | null)?.offer === "website");
  const leads = (prospects ?? []).map(toLead);
  const ready = leads.filter((l) => l.stage === "audit_prepared");
  const overdue = leads.filter((l) => l.nextFollowUp && l.nextFollowUp < today && !["won", "lost", "delivered", "maintenance"].includes(l.stage));
  const counts = prospects === null ? null : {
    identified: leads.length,
    qualified: byStage.qualified + byStage.audit_prepared,
    auditPrepared: byStage.audit_prepared,
    awaitingApproval: outreach === null ? null : websiteOutreach.filter((e) => e.event_type === "drafted" && e.review_status === "pending").length,
    sent: outreach === null ? null : websiteOutreach.filter((e) => e.event_type === "sent").length,
    replies: outreach === null ? null : websiteOutreach.filter((e) => e.event_type === "reply").length,
    quotesPending: projects === null ? null : projects.filter((p) => p.status === "quote_prepared").length,
    awaitingPayment: projects === null ? null : projects.filter((p) => p.status === "awaiting_payment").length,
    won: byStage.won + byStage.in_production + byStage.delivered + byStage.maintenance,
    inProduction: projects === null ? null : projects.filter((p) => ["in_production", "in_review", "revisions", "approved"].includes(String(p.status))).length,
    overdue: overdue.length,
  };
  const revenueUsd = revenue === null ? null : Math.round(revenue.reduce((s, r) => s + Number(r.amount_usd), 0) * 100) / 100;

  const blockers: string[] = [];
  if (ready.length && !ready.some((l) => l.contactPath === "verified email")) blockers.push("None of the audit-ready leads has a verified email. First touch must be a phone call or visit by the owner, or a verified email found first.");
  if (byStage.audit_prepared + byStage.qualified < 10) blockers.push("Fewer than 10 qualified plumbing/HVAC leads. Most audited businesses already have a decent site; new discovery should target businesses with no website (Places API: owner approval needed for the spend).");
  const next = ready.length
    ? `Review the ${ready.length} audit-ready lead(s) and pick a first contact: ${ready.slice(0, 3).map((l) => l.name).join(", ")}.`
    : counts && counts.qualified ? "Re-check the qualified leads' sites, or approve new discovery of businesses without websites." : "Run discovery for plumbing and HVAC businesses without websites (needs owner approval for the Places API spend).";

  return {
    objective: "Win the first paying customer for the $499 one-page website (plumbing and HVAC in Jacksonville first).",
    status: counts && counts.won > 0 ? "selling and delivering" : "launch: finding the first customer",
    counts, revenueUsd, byStage: prospects === null ? null : byStage,
    ready: ready.slice(0, 20), qualified: leads.filter((l) => l.stage === "qualified").slice(0, 20), overdue: overdue.slice(0, 20),
    projects: projects ?? null, blockers, next,
  };
}
