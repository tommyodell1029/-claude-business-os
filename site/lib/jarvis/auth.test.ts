import { test } from "node:test";
import assert from "node:assert/strict";
import { _clearAuthCache, clearCookies, isOwner, readCookie, requireOwner, sessionCookies } from "./auth.ts";
import { originAllowed } from "./origin.ts";
import { ENV, OWNER } from "./testkit.ts";

type Handler = (url: string, init: RequestInit) => Response;
function fakeFetch(h: Handler) {
  const calls: string[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push(url);
    return h(url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const user = (email: string, confirmed = true) => Response.json({ id: "u1", email, email_confirmed_at: confirmed ? "2026-10-03T00:00:00Z" : null });
const req = (cookie?: string, headers: Record<string, string> = {}, method = "GET") =>
  new Request("https://jarvis.example/api/jarvis/status", { method, headers: { ...(cookie ? { cookie } : {}), ...headers } });

test("only the allow-listed owner email counts; unset owner means nobody", () => {
  assert.ok(isOwner(OWNER, ENV));
  assert.ok(isOwner(" Owner@LaunchPadLocal.org ", ENV));
  assert.ok(!isOwner("someone@else.com", ENV));
  assert.ok(!isOwner("", ENV));
  assert.ok(!isOwner(OWNER, { ...ENV, JARVIS_OWNER_EMAIL: "" }));
  assert.ok(!isOwner(OWNER, { ...ENV, JARVIS_OWNER_EMAIL: undefined }));
});

test("no session cookie -> 401 without calling Supabase", async () => {
  _clearAuthCache();
  const { f, calls } = fakeFetch(() => new Response("", { status: 500 }));
  const r = await requireOwner(req(), ENV, f);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
  assert.equal(calls.length, 0);
});

test("a valid Supabase session for a non-owner is refused and cookies cleared", async () => {
  _clearAuthCache();
  const { f } = fakeFetch((url) => (url.endsWith("/auth/v1/user") ? user("intruder@example.com") : new Response("", { status: 400 })));
  const r = await requireOwner(req("jv_at=tok-intruder"), ENV, f);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.ok(r.setCookie.some((c) => c.startsWith("jv_at=;") && c.includes("Max-Age=0")));
  }
});

test("owner with unconfirmed email is refused", async () => {
  _clearAuthCache();
  const { f } = fakeFetch(() => user(OWNER, false));
  const r = await requireOwner(req("jv_at=tok-unconfirmed"), ENV, f);
  assert.equal(r.ok, false);
});

test("owner session passes", async () => {
  _clearAuthCache();
  const { f } = fakeFetch(() => user(OWNER));
  const r = await requireOwner(req("jv_at=tok-owner"), ENV, f);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.email, OWNER);
});

test("expired access token is refreshed for the owner only", async () => {
  _clearAuthCache();
  const ownerRefresh = fakeFetch((url) =>
    url.includes("grant_type=refresh_token")
      ? Response.json({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600, user: { id: "u1", email: OWNER, email_confirmed_at: "x" } })
      : new Response("", { status: 401 }),
  );
  const ok = await requireOwner(req("jv_at=old; jv_rt=rt1"), ENV, ownerRefresh.f);
  assert.ok(ok.ok);
  assert.ok(ok.setCookie.some((c) => c.startsWith("jv_at=new-at")));

  _clearAuthCache();
  const otherRefresh = fakeFetch((url) =>
    url.includes("grant_type=refresh_token")
      ? Response.json({ access_token: "x", refresh_token: "y", expires_in: 3600, user: { id: "u2", email: "x@y.com", email_confirmed_at: "x" } })
      : new Response("", { status: 401 }),
  );
  const bad = await requireOwner(req("jv_at=old; jv_rt=rt2"), ENV, otherRefresh.f);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.status, 403);
});

test("not configured -> 503; bad origin -> 403 before any Supabase call", async () => {
  _clearAuthCache();
  const { f, calls } = fakeFetch(() => user(OWNER));
  const r1 = await requireOwner(req("jv_at=t"), { ...ENV, JARVIS_OWNER_EMAIL: "" }, f);
  assert.ok(!r1.ok && r1.status === 503);
  const r2 = await requireOwner(req("jv_at=t", { origin: "https://evil.example" }), ENV, f);
  assert.ok(!r2.ok && r2.status === 403);
  assert.equal(calls.length, 0);
});

test("origin allow-list", () => {
  const post = (h: Record<string, string>) => new Request("https://jarvis.example/api/jarvis/chat", { method: "POST", headers: h });
  assert.ok(originAllowed(post({ origin: "https://jarvis.example" }), {}));
  assert.ok(!originAllowed(post({ origin: "https://evil.example" }), {}));
  assert.ok(!originAllowed(post({}), {}), "POST without Origin is refused");
  assert.ok(!originAllowed(post({ origin: "null" }), {}));
  const env = { JARVIS_ALLOWED_ORIGINS: "https://launchpadlocal.org, https://www.launchpadlocal.org/" };
  assert.ok(originAllowed(post({ origin: "https://www.launchpadlocal.org" }), env));
  assert.ok(!originAllowed(post({ origin: "https://jarvis.example" }), env), "explicit list replaces same-host");
  const get = (h: Record<string, string>) => new Request("https://jarvis.example/api/jarvis/me", { headers: h });
  assert.ok(originAllowed(get({ "sec-fetch-site": "same-origin" }), {}));
  assert.ok(!originAllowed(get({ "sec-fetch-site": "cross-site" }), {}));
});

test("session cookies are HttpOnly, Secure, SameSite=Strict and scoped to /api/jarvis", () => {
  const cs = sessionCookies({ access_token: "a", refresh_token: "r", expires_in: 3600 }, true);
  for (const c of [...cs, ...clearCookies(true)]) {
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Strict/);
    assert.match(c, /Secure/);
    assert.match(c, /Path=\/api\/jarvis/);
  }
  assert.equal(readCookie("a=1; jv_at=xyz; b=2", "jv_at"), "xyz");
  assert.equal(readCookie(null, "jv_at"), null);
});

test("sign-in start: a non-owner email never reaches Supabase", async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  Object.assign(process.env, ENV);
  try {
    const { POST } = await import("../../app/api/jarvis/auth/start/route.ts");
    const mk = (email: string, ip: string) =>
      new Request("https://jarvis.example/api/jarvis/auth/start", {
        method: "POST",
        headers: { origin: "https://jarvis.example", "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email }),
      });
    const r1 = await POST(mk("intruder@example.com", "1.1.1.1"));
    assert.equal(r1.status, 200);
    assert.equal(calls.length, 0);
    const r2 = await POST(mk(OWNER, "1.1.1.2"));
    assert.equal(r2.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/auth\/v1\/otp/);
    const r3 = await POST(new Request("https://jarvis.example/api/jarvis/auth/start", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }));
    assert.equal(r3.status, 403);
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});
