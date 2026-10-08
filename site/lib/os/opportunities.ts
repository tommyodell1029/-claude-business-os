// Money OS opportunity + evidence storage (service role, server-side only). Every input is validated here; scores,
// confidence and labels are always recomputed in code (score.ts) after a change, never taken from the caller.
import { createHash } from "node:crypto";
import type { Db } from "../jarvis/db.ts";
import type { Dimension, Labels, Proposal, Ranked } from "./score.ts";
import { column, confidence, labels, overallScore, rank, subScoresFromRow } from "./score.ts";
import { validateModels } from "./monetization.ts";

export const EVIDENCE_KINDS = ["demand", "trend", "competition", "pricing", "affiliate", "audience", "other"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const OPP_STATUSES = ["discovered", "researched", "validation_ready", "validating", "validated", "building", "live", "growing", "killed"] as const;

const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Stable id for "the same opportunity": lowercase words joined by '-', max 80 chars; null if too short. */
export function slugify(name: string): string | null {
  const s = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
  return /^[a-z0-9][a-z0-9-]{1,79}$/.test(s) ? s : null;
}

export type NewOpportunity = { name: string; category: string; problem?: string; audience?: string; monetization?: string[] };

export function validateOpportunity(input: NewOpportunity): { ok: true; value: Required<NewOpportunity> & { slug: string } } | { ok: false; error: string } {
  const name = clean(input?.name, 160);
  const category = clean(input?.category, 60).toLowerCase();
  const slug = slugify(name);
  if (!name || !slug) return { ok: false, error: "name needs at least 2 letters or digits" };
  if (!category) return { ok: false, error: "category is required" };
  const monetization = Array.isArray(input.monetization) ? input.monetization.map((m) => clean(m, 60)).filter(Boolean).slice(0, 10) : [];
  return { ok: true, value: { name, category, slug, problem: clean(input.problem, 1000), audience: clean(input.audience, 500), monetization } };
}

export type EvidenceInput = { kind: string; claim: string; source_url?: string | null; observed_at?: string | null };
export type EvidenceRow = { kind: EvidenceKind; claim: string; source_url: string | null; source_domain: string | null; observed_at: string; content_hash: string };

/** Normalizes one evidence item. Only http(s) URLs are kept; tracking parameters and fragments are dropped. */
export function normalizeEvidence(e: EvidenceInput, now: number): EvidenceRow | null {
  const kind = (EVIDENCE_KINDS as readonly string[]).includes(e?.kind) ? (e.kind as EvidenceKind) : null;
  const claim = clean(e?.claim, 600);
  if (!kind || !claim) return null;
  let url: string | null = null;
  let domain: string | null = null;
  if (typeof e.source_url === "string" && e.source_url.trim()) {
    try {
      const u = new URL(e.source_url.trim());
      if (u.protocol === "http:" || u.protocol === "https:") {
        u.hash = "";
        for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k);
        url = u.toString().slice(0, 2000);
        domain = u.hostname.toLowerCase().replace(/^www\./, "");
      }
    } catch {
      // not a URL: keep the claim, drop the link
    }
  }
  const t = Date.parse(e.observed_at ?? "");
  const observed = Number.isFinite(t) && t <= now ? new Date(t).toISOString() : new Date(now).toISOString();
  const hash = createHash("sha256").update(`${kind}|${claim.toLowerCase()}|${url ?? ""}`).digest("hex");
  return { kind, claim, source_url: url, source_domain: domain, observed_at: observed, content_hash: hash };
}

type OppRow = Record<string, unknown> & { id: string; slug: string; name: string; status: string };

export async function createOpportunity(db: Db, input: NewOpportunity): Promise<{ created: boolean; opportunity: OppRow } | { error: string }> {
  const v = validateOpportunity(input);
  if (!v.ok) return { error: v.error };
  const existing = await db.select<OppRow>("opportunities", "*", [["slug", "eq", v.value.slug]], undefined, 1);
  if (existing.length) return { created: false, opportunity: existing[0] };
  const row = await db.insert<OppRow>("opportunities", {
    slug: v.value.slug, name: v.value.name, category: v.value.category,
    problem: v.value.problem || null, audience: v.value.audience || null, monetization: v.value.monetization, status: "discovered",
  });
  return { created: true, opportunity: row };
}

/** Adds evidence, skipping exact duplicates (same kind, claim and link), then rescores. */
export async function addEvidence(db: Db, opportunityId: string, items: EvidenceInput[], now: number): Promise<{ added: number; duplicates: number; invalid: number }> {
  const have = new Set((await db.select<{ content_hash: string }>("opportunity_evidence", "content_hash", [["opportunity_id", "eq", opportunityId]], undefined, 1000)).map((r) => r.content_hash));
  let added = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const raw of items.slice(0, 50)) {
    const e = normalizeEvidence(raw, now);
    if (!e) { invalid += 1; continue; }
    if (have.has(e.content_hash)) { duplicates += 1; continue; }
    await db.insert("opportunity_evidence", { opportunity_id: opportunityId, ...e });
    have.add(e.content_hash);
    added += 1;
  }
  if (added) await rescore(db, opportunityId, now);
  return { added, duplicates, invalid };
}

/** Stores validated sub-scores and reasons (from validateProposal), then rescores. Unproposed dimensions keep their value. */
export async function applyProposal(db: Db, opportunityId: string, p: Proposal, now: number): Promise<void> {
  const current = await db.select<OppRow>("opportunities", "score_reasons", [["id", "eq", opportunityId]], undefined, 1);
  if (!current.length) throw new Error("opportunity not found");
  const reasons = { ...((current[0].score_reasons as Record<string, string>) ?? {}), ...p.reasons };
  const patch: Record<string, unknown> = { score_reasons: reasons };
  for (const d of Object.keys(p.scores) as Dimension[]) patch[column(d)] = p.scores[d];
  if (p.validationDifficulty !== null) patch.validation_difficulty = p.validationDifficulty;
  if (p.daysToFirstDollar !== null) patch.est_days_to_first_dollar = p.daysToFirstDollar;
  await db.update("opportunities", [["id", "eq", opportunityId]], patch);
  await rescore(db, opportunityId, now);
}

/** Recomputes overall score, confidence and evidence counts from stored data. */
export async function rescore(db: Db, opportunityId: string, now: number): Promise<{ overall: number | null; confidence: number; evidence: number; domains: number }> {
  const rows = await db.select<OppRow>("opportunities", "*", [["id", "eq", opportunityId]], undefined, 1);
  if (!rows.length) throw new Error("opportunity not found");
  const ev = await db.select<{ source_domain: string | null; observed_at: string }>("opportunity_evidence", "source_domain,observed_at", [["opportunity_id", "eq", opportunityId]], undefined, 1000);
  const s = subScoresFromRow(rows[0]);
  const overall = overallScore(s);
  const conf = confidence(s, ev, now);
  const domains = new Set(ev.map((e) => (e.source_domain ?? "").toLowerCase()).filter(Boolean)).size;
  await db.update("opportunities", [["id", "eq", opportunityId]], {
    overall_score: overall, confidence: conf, evidence_count: ev.length, evidence_domains: domains, updated_at: new Date(now).toISOString(),
  });
  return { overall, confidence: conf, evidence: ev.length, domains };
}

const toNum = (v: unknown): number | null => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

export type RankedOpportunity = Ranked<{
  id: string; slug: string; name: string; category: string; status: string; evidenceCount: number; domains: number;
  daysToFirstDollar: number | null; validationDifficulty: number | null; monetization: string[]; models: string[]; createdAt: string;
}>;

/** Labels for one stored row (uses the stored, code-computed overall score and confidence). */
export function labelsForRow(r: Record<string, unknown>): { overall: number | null; confidence: number; labels: Labels } {
  const overall = toNum(r.overall_score);
  const conf = toNum(r.confidence) ?? 0;
  return {
    overall,
    confidence: conf,
    labels: labels({
      overall, confidence: conf, domains: toNum(r.evidence_domains) ?? 0,
      validationDifficulty: toNum(r.validation_difficulty), daysToFirstDollar: toNum(r.est_days_to_first_dollar),
    }),
  };
}

/** Ranked opportunities (killed ones excluded unless asked for by status). Ranking is code, never the model. */
export async function listRanked(db: Db, opts: { status?: string; limit?: number } = {}): Promise<RankedOpportunity[]> {
  const status = opts.status && (OPP_STATUSES as readonly string[]).includes(opts.status) ? opts.status : null;
  const rows = await db.select<Record<string, unknown>>(
    "opportunities", "id,slug,name,category,status,overall_score,confidence,evidence_count,evidence_domains,validation_difficulty,est_days_to_first_dollar,monetization,monetization_models,created_at",
    status ? [["status", "eq", status]] : [], "overall_score.desc.nullslast", 500,
  );
  const items = rows
    .filter((r) => status || r.status !== "killed")
    .map((r) => ({
      id: String(r.id), slug: String(r.slug), name: String(r.name), category: String(r.category), status: String(r.status),
      evidenceCount: toNum(r.evidence_count) ?? 0, domains: toNum(r.evidence_domains) ?? 0,
      daysToFirstDollar: toNum(r.est_days_to_first_dollar), validationDifficulty: toNum(r.validation_difficulty),
      monetization: Array.isArray(r.monetization) ? (r.monetization as unknown[]).map(String) : [],
      models: validateModels(r.monetization_models).filter((m) => m.fit >= 6).map((m) => m.model),
      createdAt: String(r.created_at ?? ""),
      ...labelsForRow(r),
    }));
  return rank(items).slice(0, Math.max(1, Math.min(opts.limit ?? 20, 100)));
}

