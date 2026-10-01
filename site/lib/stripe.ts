// Stripe webhook helpers. No Stripe SDK: the signature check and the event -> row mapping are small enough
// to own (same approach as twilio.ts). Handles both pre- and post-2025 ("basil") invoice shapes.
import { createHmac, timingSafeEqual } from "node:crypto";

export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/** Stripe-Signature: "t=<unix>,v1=<hex hmac-sha256(secret, `${t}.${rawBody}`)>[,v1=...]". */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  opts: { toleranceSec?: number; nowSec?: number } = {},
): boolean {
  if (!secret || !header) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") sigs.push(v);
  }
  if (!/^\d+$/.test(t) || sigs.length === 0) return false;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > (opts.toleranceSec ?? 300)) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest();
  return sigs.some((s) => {
    if (!/^[0-9a-f]{64}$/i.test(s)) return false;
    return timingSafeEqual(Buffer.from(s, "hex"), expected);
  });
}

type Obj = Record<string, any>;

export type PaymentRow = {
  stripe_invoice_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  client_slug: string | null;
  type: "setup" | "monthly" | "addon";
  amount: number; // dollars
  currency: string;
  status: "paid" | "failed";
  stripe_event_id: string;
};

export type EventRow = {
  id: string;
  type: string;
  livemode: boolean;
  client_slug: string | null;
  stripe_object_id: string | null;
  summary: Obj;
};

const idOf = (v: any): string | null => (typeof v === "string" ? v : v?.id ?? null);

function invoiceMeta(inv: Obj): Obj {
  return inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? {};
}

function lineProduct(line: Obj): string {
  return idOf(line.price?.product) ?? idOf(line.pricing?.price_details?.product) ?? "";
}

function lineIsRecurring(line: Obj): boolean {
  return (
    line.type === "subscription" ||
    line.parent?.type === "subscription_item_details" ||
    line.price?.type === "recurring"
  );
}

/** Classify invoice lines into setup / monthly / addon totals (cents). $0 trial lines are dropped. */
export function invoiceTotals(inv: Obj): Map<PaymentRow["type"], number> {
  const totals = new Map<PaymentRow["type"], number>();
  for (const line of inv.lines?.data ?? []) {
    const amount = Number(line.amount ?? 0);
    if (!amount) continue;
    const product = lineProduct(line);
    const type: PaymentRow["type"] = product.startsWith("lp_addon_")
      ? "addon"
      : lineIsRecurring(line)
        ? "monthly"
        : "setup";
    totals.set(type, (totals.get(type) ?? 0) + amount);
  }
  return totals;
}

export function paymentRows(event: Obj): PaymentRow[] {
  if (event.type !== "invoice.paid" && event.type !== "invoice.payment_failed") return [];
  const inv = event.data?.object ?? {};
  const meta = invoiceMeta(inv);
  const status = event.type === "invoice.paid" ? "paid" : "failed";
  return [...invoiceTotals(inv)].map(([type, c]) => ({
    stripe_invoice_id: inv.id,
    stripe_customer_id: idOf(inv.customer),
    stripe_subscription_id: idOf(inv.parent?.subscription_details?.subscription) ?? idOf(inv.subscription),
    client_slug: meta.client_slug ?? null,
    type,
    amount: c / 100,
    currency: String(inv.currency ?? "usd"),
    status,
    stripe_event_id: event.id,
  }));
}

/** Small, non-PII summary of each handled event for public.stripe_events (idempotency + audit trail). */
export function eventRow(event: Obj): EventRow {
  const o = event.data?.object ?? {};
  let slug: string | null = null;
  let summary: Obj = {};
  if (event.type === "checkout.session.completed") {
    slug = o.metadata?.client_slug ?? o.client_reference_id ?? null;
    summary = {
      tier: o.metadata?.tier ?? null,
      pricing: o.metadata?.pricing ?? null,
      first_recurring_charge: o.metadata?.first_recurring_charge ?? null,
      payment_status: o.payment_status ?? null,
      amount_total: o.amount_total ?? null,
      subscription: idOf(o.subscription),
      customer: idOf(o.customer),
    };
  } else if (event.type.startsWith("invoice.")) {
    slug = invoiceMeta(o).client_slug ?? null;
    summary = { status: o.status ?? null, amount_paid: o.amount_paid ?? null, amount_due: o.amount_due ?? null,
                billing_reason: o.billing_reason ?? null, attempt_count: o.attempt_count ?? null };
  } else if (event.type.startsWith("customer.subscription.")) {
    slug = o.metadata?.client_slug ?? null;
    summary = { status: o.status ?? null, cancel_at_period_end: o.cancel_at_period_end ?? null,
                trial_end: o.trial_end ?? null, canceled_at: o.canceled_at ?? null, ended_at: o.ended_at ?? null };
  }
  return { id: event.id, type: event.type, livemode: !!event.livemode, client_slug: slug,
           stripe_object_id: o.id ?? null, summary };
}

/** Minimal PostgREST client (service role, server-side only). */
export function supabase(url: string, serviceKey: string, fetchImpl: typeof fetch = fetch) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const base = url.replace(/\/$/, "") + "/rest/v1";
  return {
    async seen(eventId: string): Promise<boolean> {
      const r = await fetchImpl(`${base}/stripe_events?select=id&id=eq.${encodeURIComponent(eventId)}`, { headers });
      if (!r.ok) throw new Error(`supabase select stripe_events ${r.status}`);
      return ((await r.json()) as unknown[]).length > 0;
    },
    async upsert(table: string, rows: object[], onConflict: string, ignoreDuplicates = false): Promise<void> {
      if (rows.length === 0) return;
      const r = await fetchImpl(`${base}/${table}?on_conflict=${onConflict}`, {
        method: "POST",
        headers: { ...headers, Prefer: `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates,return=minimal` },
        body: JSON.stringify(rows),
      });
      if (!r.ok) throw new Error(`supabase upsert ${table} ${r.status}`);
    },
  };
}

/** Process one verified event. Payment upserts are themselves idempotent; the event row is written last so a
 *  failed run is retried by Stripe instead of being marked done. */
export async function handleEvent(event: Obj, db: ReturnType<typeof supabase>): Promise<"ignored" | "duplicate" | "ok"> {
  if (!HANDLED_EVENTS.has(event.type)) return "ignored";
  if (await db.seen(event.id)) return "duplicate";
  await db.upsert("payments", paymentRows(event), "stripe_invoice_id,type");
  await db.upsert("stripe_events", [eventRow(event)], "id", true);
  return "ok";
}
