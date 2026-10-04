// Owner alert when a client submits their intake (Resend, transactional). Env as in leadAlert.ts:
// RESEND_API_KEY, NOTIFY_FROM_EMAIL, LEAD_ALERT_EMAIL, optional NOTIFY_REPLY_TO. Contains no client contact details.
const oneLine = (s: string, max: number): string => s.replace(/\s+/g, " ").trim().slice(0, max);

export function intakeEmail(i: { client_slug: string; tier: string; business_name: string }): { subject: string; text: string } {
  const name = oneLine(i.business_name, 100);
  return {
    subject: `Intake received: ${name}`,
    text: [
      `${name} finished their onboarding form.`,
      "",
      `Client: ${i.client_slug}  Tier: ${i.tier}`,
      "",
      "Next (dry run first, then apply):",
      `  uv run python scripts/onboard_client.py ${i.client_slug}`,
      `  uv run python scripts/onboard_client.py ${i.client_slug} --apply`,
      "",
      "Their answers (including owner contact details) are in Supabase client_intakes, not in this email.",
    ].join("\n"),
  };
}

export async function sendIntakeAlert(
  i: { id: string; client_slug: string; tier: string; business_name: string },
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<"sent" | "skipped" | "failed"> {
  const key = env.RESEND_API_KEY, from = env.NOTIFY_FROM_EMAIL, to = env.LEAD_ALERT_EMAIL?.trim();
  if (!key || !from || !to) {
    console.warn("intake alert skipped: RESEND_API_KEY, NOTIFY_FROM_EMAIL or LEAD_ALERT_EMAIL not set");
    return "skipped";
  }
  const { subject, text } = intakeEmail(i);
  const sender = from.includes("<") ? from : `LaunchPad Local <${from}>`;
  const replyTo = env.NOTIFY_REPLY_TO?.trim();
  try {
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": `intake-alert-${i.id}` },
      body: JSON.stringify({ from: sender, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      console.error(`intake alert: resend ${r.status}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error(`intake alert: ${(e as Error).name}`);
    return "failed";
  }
}
