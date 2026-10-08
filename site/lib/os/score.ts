// Money OS opportunity scoring (docs/money-os/PHASE_1_PLAN.md, "Scoring"). Pure code, no I/O, no AI.
// The model may only PROPOSE sub-scores with reasons (validateProposal); everything else — overall score,
// confidence, labels, ranking — is computed here from config/money_os.yaml `score`.
import { OS_CONFIG } from "./config.generated.ts";

export const DIMENSIONS = [
  "demand", "trend", "competition", "monetization", "recurring", "affiliate", "content", "automation", "speed",
  "startup_cost", "tech_difficulty", "acquisition_difficulty", "retention", "market_size", "defensibility",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type SubScores = Partial<Record<Dimension, number | null>>;

export type ScoreConfig = {
  weights: Record<Dimension, number>;
  inverted: readonly Dimension[];
  confidence: { evidence_target: number; domain_target: number; recency_days: number };
  labels: {
    high_score_min: number;
    strong_evidence: { min_confidence: number; min_domains: number };
    fast_validation: { max_validation_difficulty: number; max_days_to_first_dollar: number };
  };
};
const CFG = (OS_CONFIG as unknown as { score: ScoreConfig }).score;

/** Database column for a dimension (opportunities.s_<dimension>). */
export const column = (d: Dimension): string => `s_${d}`;

const num = (v: unknown): number | null => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const round = (v: number, places: number): number => Math.round(v * 10 ** places) / 10 ** places;

/** Sub-scores from an opportunities row (numeric columns may arrive as strings). */
export function subScoresFromRow(row: Record<string, unknown>): SubScores {
  return Object.fromEntries(DIMENSIONS.map((d) => [d, num(row[column(d)])])) as SubScores;
}

/** Weighted mean (0-10) of the KNOWN sub-scores, bad dimensions inverted; null when nothing is known. */
export function overallScore(s: SubScores, cfg: ScoreConfig = CFG): number | null {
  let sum = 0;
  let weight = 0;
  for (const d of DIMENSIONS) {
    const v = s[d];
    if (v === null || v === undefined) continue;
    const w = cfg.weights[d] ?? 0;
    if (w <= 0) continue;
    sum += w * (cfg.inverted.includes(d) ? 10 - v : v);
    weight += w;
  }
  return weight ? round(sum / weight, 2) : null;
}

export type EvidenceStat = { source_domain?: string | null; observed_at?: string | null };

/**
 * Confidence 0-1 = coverage (share of the 15 dimensions known) x evidence strength (mean of: evidence count vs
 * target, distinct source domains vs target, share of evidence observed within recency_days). No evidence -> 0.
 */
export function confidence(s: SubScores, evidence: EvidenceStat[], now: number, cfg: ScoreConfig = CFG): number {
  if (!evidence.length) return 0;
  const known = DIMENSIONS.filter((d) => s[d] !== null && s[d] !== undefined).length;
  const coverage = known / DIMENSIONS.length;
  const domains = new Set(evidence.map((e) => (e.source_domain ?? "").toLowerCase()).filter(Boolean)).size;
  const cutoff = now - cfg.confidence.recency_days * 86_400_000;
  const fresh = evidence.filter((e) => {
    const t = Date.parse(e.observed_at ?? "");
    return Number.isFinite(t) && t >= cutoff;
  }).length;
  const strength =
    (Math.min(1, evidence.length / cfg.confidence.evidence_target) +
      Math.min(1, domains / cfg.confidence.domain_target) +
      fresh / evidence.length) / 3;
  return round(coverage * strength, 2);
}

export type Labels = { highScore: boolean; strongEvidence: boolean; fastValidation: boolean; tier: 0 | 1 | 2 | 3; text: string };

/**
 * The three nested labels from the spec. Each tier requires the one before it:
 *   1 HIGH SCORE, 2 + STRONG EVIDENCE, 3 + FAST VALIDATION.
 */
export function labels(
  o: { overall: number | null; confidence: number; domains: number; validationDifficulty: number | null; daysToFirstDollar: number | null },
  cfg: ScoreConfig = CFG,
): Labels {
  const L = cfg.labels;
  const highScore = o.overall !== null && o.overall >= L.high_score_min;
  const strongEvidence = o.confidence >= L.strong_evidence.min_confidence && o.domains >= L.strong_evidence.min_domains;
  const fastValidation =
    o.validationDifficulty !== null && o.validationDifficulty <= L.fast_validation.max_validation_difficulty &&
    o.daysToFirstDollar !== null && o.daysToFirstDollar <= L.fast_validation.max_days_to_first_dollar;
  const tier = (highScore ? (strongEvidence ? (fastValidation ? 3 : 2) : 1) : 0) as Labels["tier"];
  const text = ["", "HIGH SCORE", "HIGH SCORE + STRONG EVIDENCE", "HIGH SCORE + STRONG EVIDENCE + FAST VALIDATION"][tier];
  return { highScore, strongEvidence, fastValidation, tier, text };
}

export type Ranked<T> = T & { overall: number | null; confidence: number; labels: Labels };

/** Best first: label tier, then overall score, then confidence. Unscored opportunities go last. */
export function rank<T>(items: Ranked<T>[]): Ranked<T>[] {
  return [...items].sort(
    (a, b) => b.labels.tier - a.labels.tier || (b.overall ?? -1) - (a.overall ?? -1) || b.confidence - a.confidence,
  );
}

export type Proposal = {
  scores: SubScores;
  reasons: Partial<Record<Dimension, string>>;
  validationDifficulty: number | null;
  daysToFirstDollar: number | null;
};

const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Validates a model's proposed sub-scores. Rejects unknown fields and out-of-range values outright.
 * A score without a non-empty reason is dropped (evidence-or-unknown). Reasons are capped at 200 characters.
 */
export function validateProposal(raw: unknown): { ok: true; value: Proposal } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "proposal must be an object" };
  const r = raw as Record<string, unknown>;
  const allowed = new Set(["scores", "reasons", "validation_difficulty", "est_days_to_first_dollar"]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) return { ok: false, error: `unknown field ${k}` };
  const scoresIn = (r.scores ?? {}) as Record<string, unknown>;
  const reasonsIn = (r.reasons ?? {}) as Record<string, unknown>;
  if (typeof scoresIn !== "object" || Array.isArray(scoresIn) || typeof reasonsIn !== "object" || Array.isArray(reasonsIn)) {
    return { ok: false, error: "scores and reasons must be objects" };
  }
  const dims = new Set<string>(DIMENSIONS);
  for (const k of [...Object.keys(scoresIn), ...Object.keys(reasonsIn)]) if (!dims.has(k)) return { ok: false, error: `unknown dimension ${k}` };

  const scores: SubScores = {};
  const reasons: Partial<Record<Dimension, string>> = {};
  for (const d of DIMENSIONS) {
    const v = scoresIn[d];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10) return { ok: false, error: `${d} must be a number 0-10` };
    const why = typeof reasonsIn[d] === "string" ? (reasonsIn[d] as string).replace(CONTROL, " ").trim().slice(0, 200) : "";
    if (!why) continue; // no reason, no score
    scores[d] = round(v, 2);
    reasons[d] = why;
  }

  const vd = r.validation_difficulty;
  if (vd !== undefined && vd !== null && (typeof vd !== "number" || !Number.isInteger(vd) || vd < 1 || vd > 10)) {
    return { ok: false, error: "validation_difficulty must be an integer 1-10" };
  }
  const days = r.est_days_to_first_dollar;
  if (days !== undefined && days !== null && (typeof days !== "number" || !Number.isInteger(days) || days < 0 || days > 3650)) {
    return { ok: false, error: "est_days_to_first_dollar must be an integer 0-3650" };
  }
  return {
    ok: true,
    value: { scores, reasons, validationDifficulty: (vd as number | null | undefined) ?? null, daysToFirstDollar: (days as number | null | undefined) ?? null },
  };
}

/** Plain-English answer to "why did this score highly?", built only from stored reasons and numbers. */
export function explain(
  s: SubScores,
  reasons: Partial<Record<Dimension, string>>,
  cfg: ScoreConfig = CFG,
): { strongest: string[]; weakest: string[]; unknown: Dimension[] } {
  const known = DIMENSIONS.filter((d) => s[d] !== null && s[d] !== undefined).map((d) => {
    const v = s[d] as number;
    const effective = cfg.inverted.includes(d) ? 10 - v : v;
    return { d, effective, impact: effective * (cfg.weights[d] ?? 0) };
  });
  const line = (x: { d: Dimension; effective: number }) => `${x.d.replace(/_/g, " ")} ${round(x.effective, 1)}/10${reasons[x.d] ? `: ${reasons[x.d]}` : ""}`;
  const byImpact = [...known].sort((a, b) => b.impact - a.impact);
  return {
    strongest: byImpact.filter((x) => x.effective >= 6).slice(0, 3).map(line),
    weakest: [...known].sort((a, b) => a.effective - b.effective).filter((x) => x.effective < 5).slice(0, 3).map(line),
    unknown: DIMENSIONS.filter((d) => s[d] === null || s[d] === undefined),
  };
}
