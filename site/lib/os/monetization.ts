// Monetization analysis (revised master prompt §5, §13, §14). The research model may PROPOSE which revenue models fit
// an opportunity (0-10 with a one-line reason) and the cheapest validation experiment; code checks every field
// against the fixed lists below, orders the result, and stores it only when the same run produced grounded evidence.
// Recurring, affiliate, speed and difficulty come from the stored sub-scores, never from this proposal.

export const REVENUE_MODELS = [
  "affiliate", "digital_product", "saas", "subscription", "lead_generation", "advertising", "sponsorship",
  "marketplace", "transaction_fee", "info_product", "paid_community", "licensing", "service", "hybrid",
] as const;
export type RevenueModel = (typeof REVENUE_MODELS)[number];

export const VALIDATION_METHODS = [
  "landing_page", "waitlist", "preorder", "affiliate_content", "search_test", "social_content", "paid_traffic",
  "concierge", "free_tool", "lead_magnet", "mockup", "marketplace_listing",
] as const;

/** Models that need software built before the first sale. */
export const NEEDS_SOFTWARE: readonly RevenueModel[] = ["saas", "transaction_fee"];

export type ModelFit = { model: RevenueModel; fit: number; reason: string };
export type Validation = { method: (typeof VALIDATION_METHODS)[number]; description: string; est_cost_usd: number; est_days: number };

const CONTROL = /[\u0000-\u001f\u007f]/g;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keeps only known models with an integer fit 0-10 and a reason; one entry per model; best fit first. */
export function validateModels(raw: unknown): ModelFit[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<RevenueModel, ModelFit>();
  for (const item of raw.slice(0, 20)) {
    if (typeof item !== "object" || item === null) continue;
    const { model, fit, reason } = item as Record<string, unknown>;
    if (!(REVENUE_MODELS as readonly unknown[]).includes(model)) continue;
    if (typeof fit !== "number" || !Number.isInteger(fit) || fit < 0 || fit > 10) continue;
    const r = text(reason, 200);
    if (!r || seen.has(model as RevenueModel)) continue;
    seen.set(model as RevenueModel, { model: model as RevenueModel, fit, reason: r });
  }
  return [...seen.values()].sort((a, b) => b.fit - a.fit || a.model.localeCompare(b.model)).slice(0, 8);
}

/** One validation plan with a known method, a description, and sane cost/time bounds; anything else -> null. */
export function validateValidation(raw: unknown): Validation | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { method, description, est_cost_usd, est_days } = raw as Record<string, unknown>;
  if (!(VALIDATION_METHODS as readonly unknown[]).includes(method)) return null;
  const d = text(description, 300);
  if (!d) return null;
  if (typeof est_cost_usd !== "number" || !Number.isFinite(est_cost_usd) || est_cost_usd < 0 || est_cost_usd > 10_000) return null;
  if (typeof est_days !== "number" || !Number.isInteger(est_days) || est_days < 0 || est_days > 365) return null;
  return { method: method as Validation["method"], description: d, est_cost_usd: Math.round(est_cost_usd * 100) / 100, est_days };
}

const num = (v: unknown): number | null => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

/** The Monetization Analysis card for one stored opportunity row. Everything here is read or derived in code. */
export function monetizationView(row: Record<string, unknown>) {
  const models = validateModels(row.monetization_models);
  const fitOf = (m: RevenueModel) => models.find((x) => x.model === m)?.fit ?? null;
  return {
    analyzed: models.length > 0,
    models,
    withoutSoftware: models.filter((m) => m.fit >= 6 && !NEEDS_SOFTWARE.includes(m.model)).map((m) => m.model),
    recurring: num(row.s_recurring),
    affiliate: num(row.s_affiliate),
    digitalProduct: fitOf("digital_product"),
    saas: fitOf("saas"),
    daysToFirstDollar: num(row.est_days_to_first_dollar),
    validationDifficulty: num(row.validation_difficulty),
    cheapestValidation: validateValidation(row.cheapest_validation),
  };
}
