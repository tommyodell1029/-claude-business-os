// Twilio <Dial action> webhook for live-call transfers (T4). The voice agent on Pipecat Cloud can't host
// HTTP routes, so it lives here. TRANSFER_ACTION_URL must be this route's exact public URL: Twilio signs it.
import { dialActionTwiml, validateTwilioSignature } from "../../../../lib/twilio.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "application/xml" } });

export async function POST(req: Request): Promise<Response> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const actionUrl = process.env.TRANSFER_ACTION_URL;
  const streamUrl = process.env.TRANSFER_STREAM_URL;
  if (!authToken || !actionUrl || !streamUrl) {
    console.error("transfer-status: missing TWILIO_AUTH_TOKEN, TRANSFER_ACTION_URL or TRANSFER_STREAM_URL");
    return new Response("not configured", { status: 500 });
  }

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;

  if (!validateTwilioSignature(authToken, actionUrl, params, req.headers.get("x-twilio-signature"))) {
    return new Response("invalid Twilio signature", { status: 403 });
  }

  return xml(
    dialActionTwiml(params.DialCallStatus ?? "", streamUrl, {
      toNumber: params.Called,
      fromNumber: params.Caller,
      serviceHost: process.env.PIPECAT_SERVICE_HOST,
    }),
  );
}
