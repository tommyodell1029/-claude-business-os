// Gumroad sales sync for Money OS. Official Gumroad API v2 (GET /v2/sales), read-only, owner-triggered (the /os
// button or a confirmed ULTRON action). Each sale becomes one revenue_entries row keyed by Gumroad's sale id
// (source "marketplace", external_id "gumroad:<id>"), so re-running never double-counts. Amounts come from the API
// in cents and are converted in code; buyer emails and other personal data are never stored.
// The token travels in the Authorization header, never in a URL.
import type { Db } from "../jarvis/db.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { logActivity } from "./usage.ts";

type GCfg = { venture: string; experiment_id: string | null; since: string; max_pages: number };
const CFG = OS_CONFIG as unknown as { timezone: string; revenue_sync: { gumroad: GCfg } };
const G = CFG.revenue_sync.gumroad;
const API = "https://api.gumroad.com/v2/sales";
const ID = /^[A-Za-z0-9_=+-]{4,80}$/;

export type Sale = { id: string; product: string; amountUsd: number; feeUsd: number; units: number; day: string; refunded: boolean };
export type SyncResult = { ok: boolean; error?: string; seen: number; added: number; alreadyHad: number; refundsMarked: number; skipped: number; addedUsd: number };

const dayIn = (iso: string, tz: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

const cents = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
};

/** One sale from the API. null when a needed field is missing or not USD (the caller counts it as skipped). */
export function toSale(raw: unknown, tz: string = CFG.timezone): Sale | null {
  const s = raw as Record<string, unknown>;
  const id = typeof s?.id === "string" && ID.test(s.id) ? s.id : null;
  const price = cents(s?.price);
  const created = Date.parse(String(s?.created_at ?? ""));
  if (!id || price === null || !Number.isFinite(created)) return null;
  if (typeof s.currency_symbol === "string" && s.currency_symbol !== "$") return null; // only USD sales are summed
  const qty = Number.isInteger(s.quantity) && (s.quantity as number) >= 1 ? Math.min(s.quantity as number, 1000) : 1;
  return {
    id,
    product: typeof s.product_name === "string" ? s.product_name.replace(/\s+/g, " ").trim().slice(0, 160) : "Gumroad product",
    amountUsd: price / 100,
    feeUsd: (cents(s.gumroad_fee) ?? 0) / 100,
    units: qty,
    day: dayIn(new Date(created).toISOString(), tz),
    refunded: s.refunded === true || s.chargedback === true || (s.disputed === true && s.dispute_won !== true),
  };
}

/** Pulls every sale since the configured start date and records the new ones. Safe to run any number of times. */
export async function syncGumroad(db: Db, env: Record<string, string | undefined>, fetchImpl: typeof fetch, now: number): Promise<SyncResult> {
  const out: SyncResult = { ok: false, seen: 0, added: 0, alreadyHad: 0, refundsMarked: 0, skipped: 0, addedUsd: 0 };
  const token = env.GUMROAD_ACCESS_TOKEN?.trim();
  if (!token) return { ...out, error: "GUMROAD_ACCESS_TOKEN not set" };

  const sales: Sale[] = [];
  let pageKey: string | null = null;
  for (let page = 0; page < G.max_pages; page++) {
    const q = new URLSearchParams({ after: G.since });
    if (pageKey) q.set("page_key", pageKey);
    let data: Record<string, unknown>;
    try {
      const r = await fetchImpl(`${API}?${q}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok || data.success === false) return { ...out, error: `gumroad ${r.status}${typeof data.message === "string" ? `: ${data.message.slice(0, 120)}` : ""}` };
    } catch (e) {
      return { ...out, error: `gumroad request failed: ${(e as Error).name}` };
    }
    for (const raw of Array.isArray(data.sales) ? data.sales : []) {
      out.seen += 1;
      const s = toSale(raw);
      if (s) sales.push(s); else out.skipped += 1;
    }
    pageKey = typeof data.next_page_key === "string" && data.next_page_key ? data.next_page_key : null;
    if (!pageKey) break;
  }

  for (const s of sales) {
    const ext = `gumroad:${s.id}`;
    const have = await db.select<{ id: string; amount_usd: number | string }>("revenue_entries", "id,amount_usd", [["source", "eq", "marketplace"], ["external_id", "eq", ext]], undefined, 1);
    if (have.length) {
      if (s.refunded && Number(have[0].amount_usd) > 0) {
        await db.update("revenue_entries", [["id", "eq", have[0].id]], { amount_usd: 0, cost_usd: 0, note: "Refunded or charged back on Gumroad (sync)" });
        out.refundsMarked += 1;
      } else out.alreadyHad += 1;
      continue;
    }
    await db.insert("revenue_entries", {
      venture: G.venture, experiment_id: G.experiment_id ?? null, source: "marketplace", product: s.product,
      amount_usd: s.refunded ? 0 : s.amountUsd, cost_usd: s.refunded ? 0 : s.feeUsd, units: s.units, occurred_on: s.day,
      external_id: ext, note: s.refunded ? "Refunded or charged back on Gumroad (sync)" : "Gumroad sale (sync)",
    });
    out.added += 1;
    if (!s.refunded) out.addedUsd = Math.round((out.addedUsd + s.amountUsd) * 100) / 100;
  }
  out.ok = true;
  await logActivity(db, "system", "gumroad_sync", `${out.seen} sales seen since ${G.since}: ${out.added} new ($${out.addedUsd.toFixed(2)}), ${out.alreadyHad} already recorded, ${out.refundsMarked} refunds marked, ${out.skipped} unreadable skipped (${new Date(now).toISOString()})`);
  return out;
}
