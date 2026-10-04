// Twilio "A call comes in" webhook for the demo number (and later client numbers). Replaces the TwiML Bin so the
// voice agent can run with websocket_auth = "token": only a call Twilio really signed gets a Pipecat session.
// Logic and doc citations: lib/pipecat.ts. TWILIO_INBOUND_URL must be this route's exact public URL.
import { inboundVoiceResponse } from "../../../../lib/pipecat.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return inboundVoiceResponse(req, {
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_INBOUND_URL: process.env.TWILIO_INBOUND_URL,
    PIPECAT_PUBLIC_API_KEY: process.env.PIPECAT_PUBLIC_API_KEY,
    PIPECAT_AGENT_NAME: process.env.PIPECAT_AGENT_NAME,
  });
}
