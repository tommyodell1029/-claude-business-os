// "Run diagnostics, Jarvis." Each check reports ok / fail / unavailable with a short detail. A check whose
// credentials are not configured reports unavailable; nothing is guessed. Every external call has a timeout.
import type { ToolCtx } from "./tools.ts";

export type Check = { name: string; status: "ok" | "fail" | "unavailable"; detail: string };

const T = 5000;

async function safe(name: string, fn: () => Promise<Check>): Promise<Check> {
  try {
    return await fn();
  } catch (e) {
    return { name, status: "fail", detail: (e as Error).name === "TimeoutError" ? "timed out" : "request failed" };
  }
}

export async function diagnostics(ctx: ToolCtx): Promise<{ checks: Check[]; ok: number; total: number }> {
  const { env, fetchImpl: f, db } = ctx;
  const checks = await Promise.all([
    safe("database", async () => {
      if (!db) return { name: "database", status: "unavailable", detail: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" };
      await db.count("calls");
      return { name: "database", status: "ok", detail: "Supabase reachable" };
    }),
    safe("last_call_saved", async () => {
      if (!db) return { name: "last_call_saved", status: "unavailable", detail: "database not configured" };
      const rows = await db.select<{ created_at: string }>("calls", "created_at", [], "created_at.desc", 1);
      return rows[0]
        ? { name: "last_call_saved", status: "ok", detail: rows[0].created_at }
        : { name: "last_call_saved", status: "unavailable", detail: "no calls saved yet" };
    }),
    safe("website", async () => {
      const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
      if (!host) return { name: "website", status: "unavailable", detail: "not running on Vercel" };
      const r = await f(`https://${host}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(T) });
      return { name: "website", status: r.status < 400 ? "ok" : "fail", detail: `${host} HTTP ${r.status}` };
    }),
    safe("resend_domains", async () => {
      if (!env.RESEND_API_KEY) return { name: "resend_domains", status: "unavailable", detail: "RESEND_API_KEY not set" };
      const r = await f("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(T) });
      if (r.status === 401 || r.status === 403) return { name: "resend_domains", status: "unavailable", detail: "the Resend key cannot read domains (sending-only key)" };
      if (!r.ok) return { name: "resend_domains", status: "fail", detail: `HTTP ${r.status}` };
      const data = ((await r.json()) as { data?: { name?: string; status?: string }[] }).data ?? [];
      if (!data.length) return { name: "resend_domains", status: "unavailable", detail: "no domains returned" };
      const bad = data.filter((d) => d.status !== "verified");
      return { name: "resend_domains", status: bad.length ? "fail" : "ok", detail: data.map((d) => `${d.name}: ${d.status}`).join(", ").slice(0, 200) };
    }),
    safe("pipecat_agent", async () => {
      // Best effort: Pipecat Cloud REST with the org private key. Unverified against a live account in J1.
      const key = env.PIPECAT_API_KEY;
      if (!key) return { name: "pipecat_agent", status: "unavailable", detail: "PIPECAT_API_KEY not set" };
      const agent = env.PIPECAT_AGENT_NAME || "lp-receptionist";
      const r = await f(`https://api.pipecat.daily.co/v1/agents/${encodeURIComponent(agent)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(T) });
      if (!r.ok) return { name: "pipecat_agent", status: "unavailable", detail: `status not readable (HTTP ${r.status})` };
      const j = (await r.json()) as { ready?: boolean; status?: string };
      if (typeof j.ready === "boolean") return { name: "pipecat_agent", status: j.ready ? "ok" : "fail", detail: `${agent} ${j.ready ? "ready" : "not ready"}` };
      return { name: "pipecat_agent", status: "unavailable", detail: `${agent}: readiness not reported` };
    }),
    safe("twilio_demo_number", async () => {
      const sid = env.TWILIO_ACCOUNT_SID, tok = env.TWILIO_AUTH_TOKEN, num = env.DEMO_TWILIO_NUMBER;
      if (!sid || !tok || !num) return { name: "twilio_demo_number", status: "unavailable", detail: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or DEMO_TWILIO_NUMBER not set" };
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(num)}`;
      const r = await f(url, { headers: { authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}` }, signal: AbortSignal.timeout(T) });
      if (!r.ok) return { name: "twilio_demo_number", status: "unavailable", detail: `HTTP ${r.status}` };
      const n = ((await r.json()) as { incoming_phone_numbers?: { voice_url?: string | null }[] }).incoming_phone_numbers?.[0];
      if (!n) return { name: "twilio_demo_number", status: "fail", detail: "number not found on the account" };
      if (!n.voice_url) return { name: "twilio_demo_number", status: "fail", detail: "no voice URL set" };
      let host = "set";
      try {
        host = new URL(n.voice_url).host;
      } catch {}
      return { name: "twilio_demo_number", status: "ok", detail: `routes to ${host}` };
    }),
  ]);
  return { checks, ok: checks.filter((c) => c.status === "ok").length, total: checks.length };
}
