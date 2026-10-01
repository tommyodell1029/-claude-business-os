// Stripe webhook: records setup/monthly/add-on payments and subscription changes in Supabase.
// Signature-checked with STRIPE_WEBHOOK_SECRET; idempotent on event.id (public.stripe_events).
// Never refunds or changes anything in Stripe: it only reads events.
import { handleEvent, supabase, verifyStripeSignature } from "../../../../lib/stripe.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !sbUrl || !sbKey) {
    console.error("stripe webhook: missing STRIPE_WEBHOOK_SECRET, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response("not configured", { status: 500 });
  }

  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return new Response("invalid Stripe signature", { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  try {
    const result = await handleEvent(event, supabase(sbUrl, sbKey));
    return Response.json({ received: true, result });
  } catch (e) {
    console.error(`stripe webhook: ${event.type} ${event.id} failed: ${(e as Error).message}`);
    return new Response("processing failed", { status: 500 }); // Stripe retries
  }
}
