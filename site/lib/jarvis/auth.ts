// Owner-only sign-in for Jarvis. Supabase Auth email OTP / magic link, called from the server with the anon key;
// the browser never talks to Supabase and never sees any key. The session lives in HttpOnly cookies scoped to
// /api/jarvis. Every Jarvis API route calls requireOwner(): a valid Supabase session is not enough, the email
// must also equal JARVIS_OWNER_EMAIL.
import { createHash } from "node:crypto";
import { originAllowed } from "./origin.ts";

type Env = Record<string, string | undefined>;
export type SbSession = { access_token: string; refresh_token: string; expires_in: number; user?: SbUser };
export type SbUser = { id: string; email?: string; email_confirmed_at?: string | null };

export const AT_COOKIE = "jv_at";
export const RT_COOKIE = "jv_rt";
const COOKIE_PATH = "/api/jarvis";
const RT_MAX_AGE = 30 * 24 * 3600;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
export const normEmail = (s: unknown): string => (typeof s === "string" ? s.trim().toLowerCase() : "");
export const validEmail = (s: string): boolean => s.length <= 254 && EMAIL_RE.test(s);

export function ownerEmail(env: Env): string | null {
  const e = normEmail(env.JARVIS_OWNER_EMAIL);
  return e && validEmail(e) ? e : null;
}

/** True only for the one allow-listed address. Unset owner -> nobody. */
export function isOwner(email: unknown, env: Env): boolean {
  const owner = ownerEmail(env);
  const e = normEmail(email);
  return owner !== null && e !== "" && e === owner;
}

export function authConfig(env: Env): { url: string; anon: string } | null {
  const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const anon = (env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return url && anon ? { url, anon } : null;
}

export function authClient(cfg: { url: string; anon: string }, fetchImpl: typeof fetch = fetch) {
  const base = `${cfg.url}/auth/v1`;
  const headers = { apikey: cfg.anon, "content-type": "application/json" };
  const post = (path: string, body: unknown) =>
    fetchImpl(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return {
    /** Emails a magic link (and the 6-digit code if the template includes {{ .Token }}). */
    async sendOtp(email: string, redirectTo: string): Promise<boolean> {
      const r = await post(`/otp?redirect_to=${encodeURIComponent(redirectTo)}`, { email, create_user: true });
      return r.ok;
    },
    async verifyOtp(email: string, token: string): Promise<SbSession | null> {
      const r = await post("/verify", { type: "email", email, token });
      return r.ok ? ((await r.json()) as SbSession) : null;
    },
    async refresh(refreshToken: string): Promise<SbSession | null> {
      const r = await post("/token?grant_type=refresh_token", { refresh_token: refreshToken });
      return r.ok ? ((await r.json()) as SbSession) : null;
    },
    async getUser(accessToken: string): Promise<SbUser | null> {
      const r = await fetchImpl(`${base}/user`, {
        headers: { apikey: cfg.anon, authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      return r.ok ? ((await r.json()) as SbUser) : null;
    },
    async logout(accessToken: string): Promise<void> {
      await fetchImpl(`${base}/logout`, { method: "POST", headers: { ...headers, authorization: `Bearer ${accessToken}` } }).catch(() => {});
    },
  };
}

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const cookie = (name: string, value: string, maxAge: number, secure: boolean) =>
  `${name}=${encodeURIComponent(value)}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;

export function sessionCookies(s: SbSession, secure: boolean): string[] {
  const atAge = Math.max(60, Math.min(Number(s.expires_in) || 3600, 24 * 3600));
  return [cookie(AT_COOKIE, s.access_token, atAge, secure), cookie(RT_COOKIE, s.refresh_token, RT_MAX_AGE, secure)];
}

export function clearCookies(secure: boolean): string[] {
  return [cookie(AT_COOKIE, "", 0, secure), cookie(RT_COOKIE, "", 0, secure)];
}

export const isSecure = (req: Request): boolean => new URL(req.url).protocol === "https:";

/** A user counts only if Supabase confirmed the email AND it is the owner's. */
export function userIsOwner(u: SbUser | null | undefined, env: Env): u is SbUser {
  return !!u && !!u.email_confirmed_at && isOwner(u.email, env);
}

// Short per-instance cache so each request does not re-hit Supabase. Keyed by a hash of the token, never the token.
const cache = new Map<string, { email: string; until: number }>();
const tokenKey = (t: string) => createHash("sha256").update(t).digest("hex");
export function _clearAuthCache(): void {
  cache.clear();
}

export type OwnerCheck =
  | { ok: true; email: string; setCookie: string[] }
  | { ok: false; status: number; error: string; setCookie: string[] };

export async function requireOwner(req: Request, env: Env, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<OwnerCheck> {
  const secure = isSecure(req);
  if (!originAllowed(req, env)) return { ok: false, status: 403, error: "Forbidden.", setCookie: [] };
  const cfg = authConfig(env);
  if (!cfg || !ownerEmail(env)) {
    console.error("jarvis auth: SUPABASE_URL, SUPABASE_ANON_KEY or JARVIS_OWNER_EMAIL not set");
    return { ok: false, status: 503, error: "Jarvis is not configured.", setCookie: [] };
  }
  const cookies = req.headers.get("cookie");
  const at = readCookie(cookies, AT_COOKIE);
  const rt = readCookie(cookies, RT_COOKIE);
  const sb = authClient(cfg, fetchImpl);

  if (at) {
    const hit = cache.get(tokenKey(at));
    if (hit && hit.until > now && isOwner(hit.email, env)) return { ok: true, email: hit.email, setCookie: [] };
    const u = await sb.getUser(at).catch(() => null);
    if (u) {
      if (!userIsOwner(u, env)) return { ok: false, status: 403, error: "Not authorized.", setCookie: clearCookies(secure) };
      cache.set(tokenKey(at), { email: normEmail(u.email), until: now + 60_000 });
      if (cache.size > 100) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
      return { ok: true, email: normEmail(u.email), setCookie: [] };
    }
  }
  if (rt) {
    const s = await sb.refresh(rt).catch(() => null);
    const u = s ? (s.user ?? (await sb.getUser(s.access_token).catch(() => null))) : null;
    if (s && u) {
      if (!userIsOwner(u, env)) return { ok: false, status: 403, error: "Not authorized.", setCookie: clearCookies(secure) };
      return { ok: true, email: normEmail(u.email), setCookie: sessionCookies(s, secure) };
    }
  }
  return { ok: false, status: 401, error: "Please sign in.", setCookie: at || rt ? clearCookies(secure) : [] };
}
