// Numbers for the HUD tiles and the morning briefing. Every value is a real count from Supabase or null.
// null is shown and spoken as "data unavailable"; nothing is estimated or filled in.
import { diagnostics } from "./diagnostics.ts";
import type { Filter } from "./db.ts";
import { hoursAgoIso, startOfDayIso } from "./db.ts";
import type { ToolCtx } from "./tools.ts";
import { spentToday } from "../os/usage.ts";
import { revenueView } from "../os/views.ts";

export const TZ = "America/New_York";

async function count(ctx: ToolCtx, table: string, filters: Filter[]): Promise<number | null> {
  if (!ctx.db) return null;
  try {
    return await ctx.db.count(table, filters);
  } catch (e) {
    console.error(`jarvis status: ${(e as Error).message}`);
    return null;
  }
}

export type Tiles = {
  ai_cost_today: number | null;
  opportunities: number | null;
  experiments_active: number | null;
  revenue_month: number | null;
  replies_7d: number | null;
  health: { ok: number; total: number; failing: string[] } | null;
};

const sub = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
const add = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);

/** Money OS numbers shared by the tiles and the briefing (each null when its source cannot be read). */
async function moneyOs(ctx: ToolCtx) {
  const [allOpps, killed, validating, live, cost, rev] = await Promise.all([
    count(ctx, "opportunities", []),
    count(ctx, "opportunities", [["status", "eq", "killed"]]),
    count(ctx, "experiments", [["status", "eq", "validating"]]),
    count(ctx, "experiments", [["status", "eq", "live"]]),
    ctx.db ? spentToday(ctx.db, ctx.now) : Promise.resolve(null),
    ctx.db ? revenueView(ctx.db, ctx.now).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    ai_cost_today: cost === null ? null : Math.round(cost * 10_000) / 10_000,
    opportunities: sub(allOpps, killed),
    experiments_active: add(validating, live),
    revenue_month: rev?.totals ? rev.totals.thisMonth : null,
  };
}

export async function tiles(ctx: ToolCtx): Promise<Tiles> {
  const week = hoursAgoIso(168, ctx.now);
  const [m, replies, diag] = await Promise.all([
    moneyOs(ctx),
    count(ctx, "outreach_events", [["event_type", "eq", "reply"], ["created_at", "gte", week]]),
    diagnostics(ctx).catch(() => null),
  ]);
  return {
    ...m,
    replies_7d: replies,
    health: diag ? { ok: diag.ok, total: diag.total, failing: diag.checks.filter((c) => c.status === "fail").map((c) => c.name) } : null,
  };
}

export async function briefing(ctx: ToolCtx) {
  const since = startOfDayIso(TZ, new Date(ctx.now), 1);
  const [m, calls, urgent, leads, drafts, replies, diag] = await Promise.all([
    moneyOs(ctx),
    count(ctx, "calls", [["created_at", "gte", since]]),
    count(ctx, "calls", [["created_at", "gte", since], ["urgency", "eq", "urgent"]]),
    count(ctx, "site_leads", [["created_at", "gte", since]]),
    count(ctx, "outreach_events", [["review_status", "eq", "pending"]]),
    count(ctx, "outreach_events", [["event_type", "eq", "reply"], ["created_at", "gte", since]]),
    diagnostics(ctx).catch(() => null),
  ]);
  return {
    period: `since the start of yesterday (${TZ})`,
    money_os: { ...m, note: "ai_cost_today and revenue_month in US dollars; revenue counts live payments only" },
    calls,
    urgent_calls: urgent,
    new_website_leads: leads,
    outreach_drafts_awaiting_approval: drafts,
    outreach_replies: replies,
    calendar: null, // not connected in J1: say "data unavailable"
    health: diag,
    note: "null means data unavailable; say so, never estimate",
  };
}
