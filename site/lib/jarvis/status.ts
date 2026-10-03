// Numbers for the HUD tiles and the morning briefing. Every value is a real count from Supabase or null.
// null is shown and spoken as "data unavailable"; nothing is estimated or filled in.
import { diagnostics } from "./diagnostics.ts";
import type { Filter } from "./db.ts";
import { hoursAgoIso, startOfDayIso } from "./db.ts";
import type { ToolCtx } from "./tools.ts";

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
  calls_today: number | null;
  urgent_today: number | null;
  leads_7d: number | null;
  drafts_pending: number | null;
  replies_7d: number | null;
  health: { ok: number; total: number; failing: string[] } | null;
};

export async function tiles(ctx: ToolCtx): Promise<Tiles> {
  const today = startOfDayIso(TZ, new Date(ctx.now));
  const week = hoursAgoIso(168, ctx.now);
  const [calls, urgent, leads, drafts, replies, diag] = await Promise.all([
    count(ctx, "calls", [["created_at", "gte", today]]),
    count(ctx, "calls", [["created_at", "gte", today], ["urgency", "eq", "urgent"]]),
    count(ctx, "site_leads", [["created_at", "gte", week]]),
    count(ctx, "outreach_events", [["review_status", "eq", "pending"]]),
    count(ctx, "outreach_events", [["event_type", "eq", "reply"], ["created_at", "gte", week]]),
    diagnostics(ctx).catch(() => null),
  ]);
  return {
    calls_today: calls,
    urgent_today: urgent,
    leads_7d: leads,
    drafts_pending: drafts,
    replies_7d: replies,
    health: diag ? { ok: diag.ok, total: diag.total, failing: diag.checks.filter((c) => c.status === "fail").map((c) => c.name) } : null,
  };
}

export async function briefing(ctx: ToolCtx) {
  const since = startOfDayIso(TZ, new Date(ctx.now), 1);
  const [calls, urgent, leads, drafts, replies, diag] = await Promise.all([
    count(ctx, "calls", [["created_at", "gte", since]]),
    count(ctx, "calls", [["created_at", "gte", since], ["urgency", "eq", "urgent"]]),
    count(ctx, "site_leads", [["created_at", "gte", since]]),
    count(ctx, "outreach_events", [["review_status", "eq", "pending"]]),
    count(ctx, "outreach_events", [["event_type", "eq", "reply"], ["created_at", "gte", since]]),
    diagnostics(ctx).catch(() => null),
  ]);
  return {
    period: `since the start of yesterday (${TZ})`,
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
