// Money OS AI ledger and budgets (docs/money-os/PHASE_1_PLAN.md, "Model router + budgets").
// Every model call writes one public.ai_usage row from the provider's `usage` object; budgets are checked in code
// BEFORE a call from today's total (public.ai_cost_daily) plus what the current request has already spent.
// Prices and limits come only from config/money_os.yaml (via config.generated.ts). Nothing here calls a model.
import type { Db } from "../jarvis/db.ts";
import { OS_CONFIG } from "./config.generated.ts";

type Price = { input: number; output: number; cache_write: number; cache_read: number };
export type OsConfig = {
  timezone: string;
  budgets: { per_day_usd: number; per_turn_usd: number; per_research_run_usd: number; per_experiment_usd: number };
  prices: Record<string, Price>;
  web_search_usd: number | null;
};

/** The `usage` object of an Anthropic Messages API response (fields may be absent). */
export type ApiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
};

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number; webSearches: number };

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * Token counts from a response. When the provider returned no usage, counts are estimated from text length
 * (about 4 characters per token) and flagged, so the AI Cost tab can say "estimated".
 */
export function tokensFrom(usage: ApiUsage | undefined | null, fallback: { inChars: number; outChars: number }): { tokens: Tokens; estimated: boolean } {
  if (!usage || typeof usage !== "object" || (usage.input_tokens === undefined && usage.output_tokens === undefined)) {
    return {
      tokens: { input: Math.ceil(fallback.inChars / 4), output: Math.ceil(fallback.outChars / 4), cacheRead: 0, cacheWrite: 0, webSearches: 0 },
      estimated: true,
    };
  }
  return {
    tokens: {
      input: n(usage.input_tokens),
      output: n(usage.output_tokens),
      cacheRead: n(usage.cache_read_input_tokens),
      cacheWrite: n(usage.cache_creation_input_tokens),
      webSearches: n(usage.server_tool_use?.web_search_requests),
    },
    estimated: false,
  };
}

/** USD cost of one call. Unknown model -> priced at the most expensive listed rate and flagged estimated. */
export function costOf(model: string, t: Tokens, cfg: OsConfig = OS_CONFIG as unknown as OsConfig): { usd: number; estimated: boolean } {
  let price = cfg.prices[model];
  let estimated = false;
  if (!price) {
    const all = Object.values(cfg.prices);
    if (!all.length) throw new Error("config/money_os.yaml lists no model prices");
    price = all.reduce((a, b) => (b.output > a.output ? b : a));
    estimated = true;
  }
  let usd = (t.input * price.input + t.output * price.output + t.cacheWrite * price.cache_write + t.cacheRead * price.cache_read) / 1_000_000;
  if (t.webSearches > 0) {
    if (cfg.web_search_usd === null || cfg.web_search_usd === undefined) estimated = true;
    else usd += t.webSearches * cfg.web_search_usd;
  }
  return { usd: Math.round(usd * 1e6) / 1e6, estimated };
}

/** Calendar day (YYYY-MM-DD) in the owner's time zone; matches public.ai_cost_daily.day. */
export function dayKey(now: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** Today's AI spend in USD, or null when it cannot be read (no database, or the query failed). */
export async function spentToday(db: Db | null, now: number, cfg: OsConfig = OS_CONFIG as unknown as OsConfig): Promise<number | null> {
  if (!db) return null;
  try {
    const rows = await db.select<{ cost_usd: number | string | null }>("ai_cost_daily", "cost_usd", [["day", "eq", dayKey(now, cfg.timezone)]], undefined, 1);
    return rows.length ? Number(rows[0].cost_usd ?? 0) : 0;
  } catch {
    return null;
  }
}

export type BudgetVerdict = { ok: true } | { ok: false; scope: "day" | "turn"; limitUsd: number; spentUsd: number };

/**
 * Pure budget check. `dayBefore` is today's spend read once at the start of the request (null = unreadable:
 * the daily limit cannot be checked, so only the per-request limit applies). Refuses once a limit is reached.
 */
export function checkBudget(dayBefore: number | null, turnSpent: number, cfg: OsConfig = OS_CONFIG as unknown as OsConfig): BudgetVerdict {
  const { per_day_usd: day, per_turn_usd: turn } = cfg.budgets;
  if (dayBefore !== null && dayBefore + turnSpent >= day) return { ok: false, scope: "day", limitUsd: day, spentUsd: dayBefore + turnSpent };
  if (turnSpent >= turn) return { ok: false, scope: "turn", limitUsd: turn, spentUsd: turnSpent };
  return { ok: true };
}

export type UsageRow = {
  task: string;
  component: string;
  model: string;
  tokens: Tokens;
  usd: number;
  estimated: boolean;
  durationMs: number;
  ok: boolean;
  opportunityId?: string | null;
  experimentId?: string | null;
};

/** Best effort: a ledger write failure never breaks the request that used the model. */
export async function logUsage(db: Db | null, r: UsageRow): Promise<void> {
  if (!db) return;
  try {
    await db.insert("ai_usage", {
      task: r.task.slice(0, 60),
      component: r.component.slice(0, 30),
      provider: "anthropic",
      model: r.model,
      input_tokens: r.tokens.input,
      output_tokens: r.tokens.output,
      cache_read_tokens: r.tokens.cacheRead,
      cache_write_tokens: r.tokens.cacheWrite,
      web_searches: r.tokens.webSearches,
      est_cost_usd: r.usd,
      estimated: r.estimated,
      duration_ms: Math.max(0, Math.round(r.durationMs)),
      ok: r.ok,
      opportunity_id: r.opportunityId ?? null,
      experiment_id: r.experimentId ?? null,
    });
  } catch {
    // ledger is best effort; the budget still holds for this request through turnSpent
  }
}

export async function logActivity(db: Db | null, actor: "owner" | "ultron" | "radar" | "system", action: string, detail: string): Promise<void> {
  if (!db) return;
  try {
    await db.insert("activity", { actor, action: action.slice(0, 60), detail: detail.slice(0, 1000) });
  } catch {
    // best effort
  }
}

export const usd = (v: number): string => `$${v.toFixed(2)}`;
