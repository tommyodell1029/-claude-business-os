// Owner alert for a new website lead, sent through Resend (transactional, one email per lead; never cold email).
// Env: RESEND_API_KEY, NOTIFY_FROM_EMAIL, LEAD_ALERT_EMAIL (recipient). Missing any of them -> "skipped".
import type { LeadInput } from "./lead.ts";

const oneLine = (s: string, max: number): string => s.replace(/\s+/g, " ").trim().slice(0, max);

export function leadEmail(lead: LeadInput): { subject: string; text: string } {
  const who = oneLine(lead.name, 60) + (lead.business ? ` (${oneLine(lead.business, 60)})` : "");
  const lines = [
    "A new lead came in through the launchpadlocal.org contact form.",
    "",
    `Name: ${oneLine(lead.name, 100)}`,
    `Business: ${lead.business ? oneLine(lead.business, 150) : "not given"}`,
    `Email: ${lead.email ?? "not given"}`,
    `Phone: ${lead.phone ?? "not given"}`,
    "",
    "Message:",
    lead.message ?? "(none)",
    "",
    "They agreed to be contacted about this request. Reply promptly.",
  ];
  return { subject: `New lead: ${who}`, text: lines.join("\n") };
}

export async function sendLeadAlert(
  lead: LeadInput,
  leadId: string | null,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<"sent" | "skipped" | "failed"> {
  const key = env.RESEND_API_KEY, from = env.NOTIFY_FROM_EMAIL, to = env.LEAD_ALERT_EMAIL?.trim();
  if (!key || !from || !to) {
    console.warn("lead alert skipped: RESEND_API_KEY, NOTIFY_FROM_EMAIL or LEAD_ALERT_EMAIL not set");
    return "skipped";
  }
  const { subject, text } = leadEmail(lead);
  try {
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        // Same key the Python sweep uses, so a lead is never emailed twice.
        ...(leadId ? { "idempotency-key": `lead-alert-${leadId}` } : {}),
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      console.error(`lead alert: resend ${r.status}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error(`lead alert: ${(e as Error).name}`);
    return "failed";
  }
}
