// Client intake: token handling, answer validation, and the client_intakes table (service role, server-side only).
// Tokens are 32 random bytes (base64url); only sha256(token) is stored. Never import this from a client component.
import { createHash } from "node:crypto";

/** Exact wording shown next to the checkbox and stored with the answers; the client cannot supply its own. */
export const ONBOARD_CONSENT_TEXT =
  "I confirm these answers are accurate and I agree that LaunchPad Local may use them to set up and run my AI phone receptionist. I have read the Privacy Policy.";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const LIMITS = {
  short: 150, address: 300, list: 20, listItem: 150, faqs: 10, faqQ: 200, faqA: 600, emergency: 15, neverSay: 10, neverSayItem: 200,
  greeting: 200, email: 254,
} as const;

const TOKEN_RE = /^[A-Za-z0-9_-]{43,86}$/;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const HOURS_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export const isTokenShape = (t: string): boolean => TOKEN_RE.test(t);
export const hashToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strip = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const clean = (v: unknown): string => strip(str(v));
/** Same rule as lp.text.norm_phone: US 10 digits (optional leading 1), area and exchange code not starting 0/1. */
export function normPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || "01".includes(d[0]) || "01".includes(d[3])) return null;
  return `+1${d}`;
}
const toList = (v: unknown): string[] => {
  const items = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,;]+/) : [];
  return items.map(clean).filter(Boolean);
};

export type Answers = {
  business_name: string;
  industry: string;
  address: string;
  service_area: string[];
  hours: Record<(typeof DAYS)[number], string>;
  services: string[];
  faqs: { q: string; a: string }[];
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  handoff_number: string;
  emergency_keywords: string[];
  greeting: string;
  languages: string[];
  greeting_es?: string;
  never_say: string[];
};

export type Validation = { ok: true; answers: Answers } | { ok: false; spam: true } | { ok: false; spam: false; errors: Record<string, string> };

export function validateIntake(body: unknown, opts: { spanishAllowed: boolean }): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, spam: false, errors: { form: "Invalid request." } };
  const b = body as Record<string, unknown>;
  if (str(b.website) !== "") return { ok: false, spam: true }; // honeypot
  const errors: Record<string, string> = {};
  const len = (k: string, s: string, max: number, msg: string) => {
    if (!s) errors[k] = msg;
    else if (s.length > max) errors[k] = "That is too long.";
  };

  const business_name = clean(b.business_name), industry = clean(b.industry), address = clean(b.address);
  len("business_name", business_name, LIMITS.short, "Please enter your business name.");
  len("industry", industry, LIMITS.short, "Please tell us what kind of business this is.");
  len("address", address, LIMITS.address, "Please enter your business address.");

  const listCheck = (k: string, items: string[], max: number, itemMax: number, msg: string): string[] => {
    if (!items.length) errors[k] = msg;
    else if (items.length > max || items.some((i) => i.length > itemMax)) errors[k] = "That list is too long.";
    return items;
  };
  const service_area = listCheck("service_area", toList(b.service_area), LIMITS.list, LIMITS.listItem, "Please list the areas you serve.");
  const services = listCheck("services", toList(b.services), LIMITS.list, LIMITS.listItem, "Please list the services you offer.");

  const hours = {} as Record<(typeof DAYS)[number], string>;
  const hb = typeof b.hours === "object" && b.hours !== null && !Array.isArray(b.hours) ? (b.hours as Record<string, unknown>) : {};
  for (const d of DAYS) {
    const v = str(hb[d]);
    if (v === "closed" || (HOURS_RE.test(v) && v.slice(0, 5) < v.slice(6))) hours[d] = v;
    else errors[`hours_${d}`] = "Pick open and close times, or mark this day closed.";
  }

  const faqs: { q: string; a: string }[] = [];
  const rawFaqs = Array.isArray(b.faqs) ? b.faqs : [];
  if (rawFaqs.length > LIMITS.faqs) errors.faqs = `Please keep this to ${LIMITS.faqs} questions.`;
  for (const f of rawFaqs.slice(0, LIMITS.faqs)) {
    const fo = (typeof f === "object" && f !== null ? f : {}) as Record<string, unknown>;
    const q = clean(fo.q), a = clean(fo.a);
    if (!q && !a) continue; // blank rows are ignored
    if (!q || !a) errors.faqs = "Each question needs an answer, and each answer needs a question.";
    else if (q.length > LIMITS.faqQ || a.length > LIMITS.faqA) errors.faqs = "A question or answer is too long.";
    else faqs.push({ q, a });
  }

  const owner_name = clean(b.owner_name);
  len("owner_name", owner_name, 100, "Please enter the owner's name.");
  const ownerPhoneRaw = clean(b.owner_phone), handoffRaw = clean(b.handoff_number), email = clean(b.owner_email);
  const owner_phone = normPhone(ownerPhoneRaw) ?? "";
  const handoff_number = normPhone(handoffRaw) ?? "";
  if (!owner_phone || ownerPhoneRaw.length > 20) errors.owner_phone = "Please enter a valid US cell number.";
  if (!handoff_number || handoffRaw.length > 20) errors.handoff_number = "Please enter the number to ring for emergencies.";
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email)) errors.owner_email = "Please enter a valid email address.";

  const emergency_keywords = toList(b.emergency_keywords).map((k) => k.toLowerCase());
  if (!emergency_keywords.length) errors.emergency_keywords = "Please give at least one thing that counts as an emergency.";
  else if (emergency_keywords.length > LIMITS.emergency || emergency_keywords.some((k) => k.length > 60)) errors.emergency_keywords = "Please keep each emergency phrase short (up to 15 of them).";

  const greeting = clean(b.greeting);
  len("greeting", greeting, LIMITS.greeting, "Please enter how the receptionist should greet callers.");

  const langs = Array.isArray(b.languages) ? b.languages.map(str) : ["en"];
  const wantsEs = langs.includes("es");
  if (langs.some((l) => l !== "en" && l !== "es")) errors.languages = "Unsupported language.";
  if (wantsEs && !opts.spanishAllowed) errors.languages = "Spanish is not part of your plan. Contact us to add it.";
  const languages = wantsEs && opts.spanishAllowed ? ["en", "es"] : ["en"];
  const greeting_es = clean(b.greeting_es);
  if (languages.includes("es")) len("greeting_es", greeting_es, LIMITS.greeting, "Please enter the Spanish greeting.");

  const never_say = toList(b.never_say);
  if (never_say.length > LIMITS.neverSay || never_say.some((n) => n.length > LIMITS.neverSayItem)) errors.never_say = "That list is too long.";

  // '{{' is reserved for template variables in the voice agent prompt.
  const free = [business_name, industry, address, greeting, greeting_es, owner_name, ...service_area, ...services, ...emergency_keywords, ...never_say, ...faqs.flatMap((f) => [f.q, f.a])];
  if (free.some((s) => s.includes("{{"))) errors.form = "Please remove the characters {{ from your answers.";

  if (b.consent !== true) errors.consent = "Please check the box so we can use your answers.";
  if (Object.keys(errors).length) return { ok: false, spam: false, errors };
  return {
    ok: true,
    answers: {
      business_name, industry, address, service_area, hours, services, faqs, owner_name, owner_phone, owner_email: email.toLowerCase(),
      handoff_number, emergency_keywords, greeting, languages, ...(languages.includes("es") ? { greeting_es } : {}), never_say,
    },
  };
}

export type IntakeRow = {
  id: string; client_slug: string; tier: "launch" | "growth" | "scale"; spanish: boolean; business_hint: string | null;
  status: "pending" | "submitted" | "applied" | "revoked"; expires_at: string;
};
export const spanishAllowed = (r: Pick<IntakeRow, "tier" | "spanish">): boolean => r.tier === "scale" || r.spanish;
export const isOpen = (r: IntakeRow, now = Date.now()): boolean => r.status === "pending" && Date.parse(r.expires_at) > now;

export function intakesDb(url: string, serviceKey: string, fetchImpl: typeof fetch = fetch) {
  const base = `${url.replace(/\/$/, "")}/rest/v1/client_intakes`;
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const cols = "id,client_slug,tier,spanish,business_hint,status,expires_at";
  return {
    async findByHash(tokenHash: string): Promise<IntakeRow | null> {
      const r = await fetchImpl(`${base}?select=${cols}&token_hash=eq.${tokenHash}&limit=1`, { headers });
      if (!r.ok) throw new Error(`supabase read client_intakes ${r.status}`);
      return ((await r.json()) as IntakeRow[])[0] ?? null;
    },
    /** Atomic single-use submit: only a still-pending, unexpired row matches, so a second submit (or a race) gets null. */
    async claim(tokenHash: string, fields: { answers: Answers; consent_text: string; ip_hash: string }, nowIso = new Date().toISOString()): Promise<IntakeRow | null> {
      const q = `${base}?token_hash=eq.${tokenHash}&status=eq.pending&expires_at=gt.${encodeURIComponent(nowIso)}&select=${cols}`;
      const r = await fetchImpl(q, {
        method: "PATCH",
        headers: { ...headers, prefer: "return=representation" },
        body: JSON.stringify({ ...fields, status: "submitted", submitted_at: nowIso }),
      });
      if (!r.ok) throw new Error(`supabase claim client_intakes ${r.status}`);
      return ((await r.json()) as IntakeRow[])[0] ?? null;
    },
  };
}
