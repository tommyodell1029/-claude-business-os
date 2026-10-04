// Twilio <Dial action> webhook for live-call transfers (T4). The voice agent on Pipecat Cloud can't host
// HTTP routes, so it lives here. TRANSFER_ACTION_URL must be this route's exact public URL: Twilio signs it.
// With PIPECAT_PUBLIC_API_KEY set, the reconnect uses a fresh Pipecat session token (lib/pipecat.ts).
import { transferStatusResponse } from "../../../../lib/pipecat.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return transferStatusResponse(req, {
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TRANSFER_ACTION_URL: process.env.TRANSFER_ACTION_URL,
    TRANSFER_STREAM_URL: process.env.TRANSFER_STREAM_URL,
    PIPECAT_SERVICE_HOST: process.env.PIPECAT_SERVICE_HOST,
    PIPECAT_PUBLIC_API_KEY: process.env.PIPECAT_PUBLIC_API_KEY,
    PIPECAT_AGENT_NAME: process.env.PIPECAT_AGENT_NAME,
  });
}
