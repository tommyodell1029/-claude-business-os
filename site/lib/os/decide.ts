// Experiment decision helper. Code only, no model: compares the sales recorded for an experiment (revenue_entries
// units) with the number in its target ("3 sales in 14 days") and suggests a next step using the Day 14 rules from
// the content-plan PDFs. It only suggests; the owner changes the status (on /os or by confirming ULTRON).
// Views/traffic are not in Money OS, so the zero-sales case says DATA UNAVAILABLE and tells the owner where to look.
import type { Db } from "../jarvis/db.ts";
import { OS_CONFIG } from "./config.generated.ts";

const E = (OS_CONFIG as unknown as { experiments: { default_window_days: number; extend_days: number } }).experiments;
const DAY = 86_400_000;

export type Suggestion = { action: "validated" | "wait" | "extend" | "review_traffic" | "set_target" | "closed"; text: string };
export type Check = {
  id: string; name: string; status: string; target: string | null;
  targetSales: number | null; windowDays: number; day: number; daysLeft: number; deadline: string;
  sales: number; revenueUsd: number; entries: number; suggestion: Suggestion;
};

/** "3 sales in 14 days" -> { sales: 3, days: 14 }. Unknown parts are null, never guessed. */
export function parseTarget(target: string | null | undefined): { sales: number | null; days: number | null } {
  const t = String(target ?? "");
  const sales = /(\d{1,4})\s*(?:sales?|orders?|purchases?|customers?|buyers?)\b/i.exec(t);
  const days = /(\d{1,3})\s*days?\b/i.exec(t);
  return { sales: sales ? Number(sales[1]) : null, days: days ? Number(days[1]) : null };
}

export function suggest(c: Omit<Check, "suggestion">): Suggestion {
  if (!["validating", "validation_ready"].includes(c.status)) return { action: "closed", text: `Already ${c.status.replace(/_/g, " ")}.` };
  if (c.targetSales === null) return { action: "set_target", text: "No number in the target. Add one (for example \"3 sales in 14 days\") to get a suggestion." };
  const progress = `${c.sales} of ${c.targetSales} sales recorded ($${c.revenueUsd.toFixed(2)})`;
  if (c.sales >= c.targetSales) return { action: "validated", text: `Target hit: ${progress}. Suggest marking it validated.` };
  if (c.daysLeft > 0) return { action: "wait", text: `Day ${c.day} of ${c.windowDays}: ${progress}. Decide on ${c.deadline} (${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} left).` };
  if (c.sales > 0) return { action: "extend", text: `Deadline passed with ${progress}. Suggest extending ${E.extend_days} days and putting more posts on the channel that sold.` };
  return {
    action: "review_traffic",
    text: `Deadline passed with no sales recorded. Views are DATA UNAVAILABLE in Money OS: check Etsy Stats or Gumroad Analytics. Few views means a traffic problem (keep promoting ${E.extend_days} more days); plenty of views but no sales means kill it or change the offer. Record any sales first if some are missing.`,
  };
}

const localDate = (ms: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: (OS_CONFIG as unknown as { timezone: string }).timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** Decision checks for one experiment, or every open one (validating / validation_ready) when id is omitted. */
export async function experimentChecks(db: Db, now: number, id?: string): Promise<Check[]> {
  const rows = id
    ? await db.select<Record<string, unknown>>("experiments", "id,name,status,target,started_at", [["id", "eq", id]], undefined, 1)
    : await db.select<Record<string, unknown>>("experiments", "id,name,status,target,started_at", [], "started_at.asc", 100);
  const open = id ? rows : rows.filter((r) => ["validating", "validation_ready"].includes(String(r.status)));
  const out: Check[] = [];
  for (const r of open) {
    const t = parseTarget(r.target as string | null);
    const windowDays = t.days ?? E.default_window_days;
    const started = Date.parse(String(r.started_at));
    const deadlineMs = started + windowDays * DAY;
    const entries = await db.select<{ units: number | string | null; amount_usd: number | string }>("revenue_entries", "units,amount_usd", [["experiment_id", "eq", String(r.id)]], undefined, 2000);
    const paid = entries.filter((e) => Number(e.amount_usd) > 0); // refunded sales are kept at $0 and do not count
    const base = {
      id: String(r.id), name: String(r.name), status: String(r.status), target: (r.target as string | null) ?? null,
      targetSales: t.sales, windowDays,
      day: Math.max(1, Math.floor((now - started) / DAY) + 1),
      daysLeft: Math.max(0, Math.ceil((deadlineMs - now) / DAY)),
      deadline: localDate(deadlineMs),
      sales: paid.reduce((s, e) => s + Math.max(1, Number(e.units ?? 1)), 0),
      revenueUsd: Math.round(paid.reduce((s, e) => s + Number(e.amount_usd), 0) * 100) / 100,
      entries: entries.length,
    };
    out.push({ ...base, suggestion: suggest(base) });
  }
  return out;
}
