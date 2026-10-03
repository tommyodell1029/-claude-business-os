// Contact-form lead intake: validation, IP hashing, rate limiting. Pure functions plus one Supabase insert
// (service role, server-side only; this file is never imported by client components).
import { createHash } from "node:crypto";

/** Exact wording shown next to the checkbox. Stored with every lead; the client cannot supply its own. */
export const CONSENT_TEXT =
  "I agree that LaunchPad Local may contact me by phone, text or email about my request, and I have read the Privacy Policy.";

export const LIMITS = { name: 100, email: 254, phone: 20, business: 150, message: 2000 } as const;

export type LeadInput = {
  name: string;
  email: string | null;
  phone: string | null;
  business: string | null;
  message: string | null;
};

export type Validation =
  | { ok: true; lead: LeadInput }
  | { ok: false; spam: true }
  | { ok: false; spam: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strip = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

export function validateLead(body: unknown): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, spam: false, errors: { form: "Invalid request." } };
  }
  const b = body as Record<string, unknown>;
  // Honeypot: a hidden field real visitors never fill. Pretend success, store nothing.
  if (str(b.website) !== "") return { ok: false, spam: true };

  const errors: Record<string, string> = {};
  const name = strip(str(b.name));
  const email = strip(str(b.email));
  const phoneRaw = strip(str(b.phone));
  const business = strip(str(b.business));
  const message = strip(str(b.message));

  if (!name) errors.name = "Please enter your name.";
  else if (name.length > LIMITS.name) errors.name = "Name is too long.";

  if (email && (email.length > LIMITS.email || !EMAIL_RE.test(email))) errors.email = "Please enter a valid email address.";

  let phone = "";
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, "");
    if (phoneRaw.length > LIMITS.phone || !/^[\d\s().+-]+$/.test(phoneRaw) || digits.length < 10 || digits.length > 15) {
      errors.phone = "Please enter a valid phone number.";
    } else phone = phoneRaw;
  }

  if (!email && !phone) errors.contact = "Please give us an email or a phone number so we can reach you.";
  if (business.length > LIMITS.business) errors.business = "Business name is too long.";
  if (message.length > LIMITS.message) errors.message = "Message is too long.";
  if (b.consent !== true) errors.consent = "Please check the box so we can contact you.";

  if (Object.keys(errors).length) return { ok: false, spam: false, errors };
  return {
    ok: true,
    lead: { name, email: email || null, phone: phone || null, business: business || null, message: message || null },
  };
}

export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/** sha256(ip + salt), hex. The raw IP is never stored or logged. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(ip + salt, "utf8").digest("hex");
}

/** Sliding-window limiter, per server instance. First line of defense; the database check below is the shared one. */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      return true;
    },
  };
}

export const DB_HOURLY_LIMIT = 5;

export function leadsDb(url: string, serviceKey: string, fetchImpl: typeof fetch = fetch) {
  const base = `${url.replace(/\/$/, "")}/rest/v1/site_leads`;
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  return {
    /** Leads from this IP hash in the last hour (shared across serverless instances). */
    async recentCount(ipHash: string, sinceIso: string): Promise<number> {
      const q = `${base}?select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(sinceIso)}`;
      const r = await fetchImpl(q, { headers: { ...headers, prefer: "count=exact", range: "0-0" } });
      if (!r.ok) throw new Error(`supabase count site_leads ${r.status}`);
      const m = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "");
      return m ? Number(m[1]) : 0;
    },
    /** Inserts the lead and returns its id (null if the response had none). */
    async insert(row: Record<string, unknown>): Promise<string | null> {
      const r = await fetchImpl(base, { method: "POST", headers: { ...headers, prefer: "return=representation" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error(`supabase insert site_leads ${r.status}`);
      const rows = (await r.json().catch(() => [])) as { id?: string }[];
      return rows[0]?.id ?? null;
    },
    /** Best effort: remember that the owner was alerted so the Python sweep skips this lead. */
    async markNotified(id: string, status: string): Promise<void> {
      const r = await fetchImpl(`${base}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...headers, prefer: "return=minimal" },
        body: JSON.stringify({ notified_at: status === "sent" ? new Date().toISOString() : null, email_status: status }),
      });
      if (!r.ok) throw new Error(`supabase update site_leads ${r.status}`);
    },
  };
}
