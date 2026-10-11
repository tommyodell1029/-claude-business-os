import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../jarvis/testkit.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { CATEGORY, evidenceFor, isEnglish, latestSignals, parseDuration, plannedUnits, socialRadar, toSignal } from "./social.ts";

const NOW = Date.parse("2026-10-10T16:00:00Z");
const ENV = { ANTHROPIC_API_KEY: "test", YOUTUBE_API_KEY: "yt-secret-key" };
const Y = (OS_CONFIG as unknown as { social_radar: { youtube: { queries: string[]; daily_units_cap: number } } }).social_radar.youtube;
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const video = (id: string, views: number, age: number, title = `Video ${id}`) => ({
  id, snippet: { title, channelTitle: `Channel ${id}`, publishedAt: daysAgo(age) }, statistics: { viewCount: String(views), likeCount: "10", commentCount: "42" },
});

/** Routes YouTube and Anthropic requests; records every request URL + headers. */
function fakeFetch(opts: { model?: unknown; searchStatus?: number } = {}, seen: { url: string; headers: Record<string, string> }[] = []) {
  return (async (u: string, init: RequestInit = {}) => {
    seen.push({ url: String(u), headers: (init.headers ?? {}) as Record<string, string> });
    const url = new URL(String(u));
    if (url.hostname === "www.googleapis.com" && url.pathname.endsWith("/search")) {
      if (opts.searchStatus) return Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: opts.searchStatus });
      const q = url.searchParams.get("q") ?? "";
      const i = Y.queries.indexOf(q);
      return Response.json({ items: [{ id: { videoId: `vid${i}aaaa` } }, { id: { videoId: "shared00aaa" } }] });
    }
    if (url.hostname === "www.googleapis.com" && url.pathname.endsWith("/videos")) {
      const ids = (url.searchParams.get("id") ?? "").split(",");
      return Response.json({ items: ids.map((id, n) => video(id, (n + 1) * 10_000, n + 2)) });
    }
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.tools, undefined, "the grouping call must not use web search");
      return Response.json({ stop_reason: "end_turn", usage: { input_tokens: 3000, output_tokens: 500 }, content: [{ type: "text", text: JSON.stringify(opts.model ?? { opportunities: [] }) }] });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
}

test("signals use the API's own numbers; incomplete items are skipped", () => {
  const s = toSignal(video("abcdefgh123", 90_000, 9, "  How I   make money "), "make money online", NOW);
  assert.ok(s);
  assert.equal(s.views, 90_000);
  assert.equal(s.viewsPerDay, 10_000);
  assert.equal(s.title, "How I make money");
  assert.equal(s.url, "https://www.youtube.com/watch?v=abcdefgh123");
  assert.equal(toSignal({ id: "abcdefgh123", snippet: { title: "x", publishedAt: daysAgo(1) }, statistics: {} }, "q", NOW), null); // no view count
  assert.equal(toSignal({ id: "bad id!", snippet: { title: "x", publishedAt: daysAgo(1) }, statistics: { viewCount: "5" } }, "q", NOW), null);
  const ev = evidenceFor(s);
  assert.equal(ev.kind, "demand");
  assert.match(ev.claim, /90\.0k views in 9 days \(about 10\.0k\/day\), 42 comments/);
});

test("a sweep stores videos, keeps only cited videos as evidence, and never puts the key in a URL", async () => {
  const fx = fakeDb();
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const model = { opportunities: [
    { name: "AI side hustle starter kit", problem: "Beginners want a step-by-step start", audience: "beginners", monetization: ["one-time sale"], videos: [0, 1, 99] },
    { name: "Invented idea", problem: "x", audience: "y", videos: [500] },
  ] };
  const r = await socialRadar({ db: fx.db, env: ENV, fetchImpl: fakeFetch({ model }, seen), now: NOW });
  assert.ok(r.ok, r.error);
  assert.equal(r.videos, Y.queries.length + 1); // one unique video per query plus one shared video, deduplicated
  assert.equal(r.quotaUnits, Y.queries.length * 100 + 1); // searches + one videos.list call for 9 ids
  assert.ok(r.quotaUnits <= plannedUnits());
  assert.equal(r.created, 1);
  assert.equal(r.evidenceAdded, 2);
  assert.equal(r.dropped, 2); // index 99 in the first, the whole second opportunity
  const opp = fx.tables.opportunities[0];
  assert.equal(opp.category, CATEGORY);
  for (const e of fx.tables.opportunity_evidence) assert.match(String(e.source_url), /^https:\/\/www\.youtube\.com\/watch\?v=/);
  assert.equal(fx.tables.social_sweeps.length, 1);
  assert.equal(fx.tables.social_sweeps[0].status, "ok");
  for (const s of seen) assert.doesNotMatch(s.url, /yt-secret-key/);
  assert.ok(seen.some((s) => s.headers["x-goog-api-key"] === "yt-secret-key"));
  const latest = await latestSignals(fx.db, 3);
  assert.ok(latest && latest.signals.length === 3);
  assert.ok(latest.signals[0].viewsPerDay >= latest.signals[1].viewsPerDay);
});

test("a recent sweep is reused for free; fresh runs again", async () => {
  const fx = fakeDb({ social_sweeps: [{ id: "s1", source: "youtube", mode: "all", status: "ok", quota_units: 803, created_at: new Date(NOW - 3_600_000).toISOString(), signals: [toSignal(video("abcdefgh123", 1000, 2), "q", NOW)], result: { videos: 1 } }] });
  const r = await socialRadar({ db: fx.db, env: ENV, fetchImpl: fakeFetch(), now: NOW });
  assert.ok(r.ok && r.cached);
  assert.equal(r.spentUsd, 0);
  assert.equal(fx.tables.social_sweeps.length, 1);
});

test("quota cap, missing key and the emergency stop refuse before any API call", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const full = fakeDb({ social_sweeps: [{ id: "s0", source: "youtube", status: "ok", quota_units: Y.daily_units_cap, created_at: new Date(NOW - 60_000).toISOString(), signals: [] }] });
  const q = await socialRadar({ db: full.db, env: ENV, fetchImpl: fakeFetch({}, seen), now: NOW }, { force: true });
  assert.equal(q.ok, false);
  assert.match(String(q.error), /quota cap/);
  const k = await socialRadar({ db: fakeDb().db, env: { ANTHROPIC_API_KEY: "test" }, fetchImpl: fakeFetch({}, seen), now: NOW });
  assert.match(String(k.error), /YOUTUBE_API_KEY/);
  const stopped = fakeDb({ os_settings: [{ key: "ai_paused", value: 1 }] });
  const p = await socialRadar({ db: stopped.db, env: ENV, fetchImpl: fakeFetch({}, seen), now: NOW });
  assert.match(String(p.error), /emergency stop/);
  assert.equal(seen.length, 0);
});

test("when every search fails, the failure is stored with the quota it used and nothing is invented", async () => {
  const fx = fakeDb();
  const r = await socialRadar({ db: fx.db, env: ENV, fetchImpl: fakeFetch({ searchStatus: 403 }), now: NOW });
  assert.equal(r.ok, false);
  assert.match(String(r.error), /403 quotaExceeded/);
  assert.equal(fx.tables.social_sweeps[0].status, "failed");
  assert.equal(fx.tables.opportunities, undefined);
});

test("only English videos are kept: declared language first, then mostly-Latin titles", () => {
  assert.equal(isEnglish({ defaultAudioLanguage: "en-US" }, "anything"), true);
  assert.equal(isEnglish({ defaultAudioLanguage: "hi" }, "Small business ideas"), false);
  assert.equal(isEnglish({}, "I Tried The LAZIEST Way to Make Money With AI"), true);
  assert.equal(isEnglish({}, "नौकरी के भरोसे मत रहो! ये 8 Small Businesses करो"), false);
  assert.equal(isEnglish({}, "💰📱"), false);
  const hindi = { ...video("abcdefgh123", 1000, 2), snippet: { title: "कपड़ों के टुकड़ों से बना", channelTitle: "x", publishedAt: daysAgo(2) } };
  assert.equal(toSignal(hindi, "q", NOW), null);
});

test("Shorts mode: searches short videos only, keeps what the API says is 3 minutes or less, and caches separately", async () => {
  const fx = fakeDb();
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const SQ = (OS_CONFIG as unknown as { social_radar: { shorts: { queries: string[] } } }).social_radar.shorts.queries;
  const durations: Record<string, string> = { short1aaaa: "PT45S", short2aaaa: "PT2M59S", long0aaaaa: "PT3M30S", nodur0aaaa: "" };
  const fetchImpl = (async (u: string, init: RequestInit = {}) => {
    seen.push({ url: String(u), headers: (init.headers ?? {}) as Record<string, string> });
    const url = new URL(String(u));
    if (url.pathname.endsWith("/search")) return Response.json({ items: Object.keys(durations).map((videoId) => ({ id: { videoId } })) });
    if (url.pathname.endsWith("/videos")) {
      assert.match(url.searchParams.get("part") ?? "", /contentDetails/);
      return Response.json({ items: (url.searchParams.get("id") ?? "").split(",").map((id) => ({ ...video(id, 50_000, 5), ...(durations[id] ? { contentDetails: { duration: durations[id] } } : {}) })) });
    }
    if (url.hostname === "api.anthropic.com") {
      assert.match(JSON.parse(String(init.body)).messages[0].content, /YouTube Shorts/);
      return Response.json({ stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: "text", text: JSON.stringify({ opportunities: [{ name: "AI side hustle starter kit", problem: "p", audience: "a", videos: [0] }] }) }] });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;

  const r = await socialRadar({ db: fx.db, env: ENV, fetchImpl, now: NOW }, { mode: "shorts" });
  assert.ok(r.ok, r.error);
  assert.equal(r.videos, 2);
  assert.deepEqual(r.top.map((s) => s.id).sort(), ["short1aaaa", "short2aaaa"]);
  assert.equal(r.top[0].url, `https://www.youtube.com/shorts/${r.top[0].id}`);
  const searches = seen.filter((s) => s.url.includes("/search"));
  assert.equal(searches.length, SQ.length);
  for (const s of searches) assert.equal(new URL(s.url).searchParams.get("videoDuration"), "short");
  assert.equal(fx.tables.social_sweeps[0].mode, "shorts");
  assert.match(String(fx.tables.opportunity_evidence[0].claim), /^YouTube Short: /);

  // a Shorts sweep does not satisfy the normal sweep's cache, and vice versa
  const latestAll = await latestSignals(fx.db, 10, "all");
  assert.deepEqual(latestAll?.signals, []);
  fx.tables.social_sweeps[0].created_at = new Date(NOW).toISOString(); // the real table sets created_at
  const again = await socialRadar({ db: fx.db, env: ENV, fetchImpl, now: NOW + 60_000 }, { mode: "shorts" });
  assert.equal(again.cached, true);
});

test("durations are parsed from ISO 8601, never guessed", () => {
  assert.equal(parseDuration("PT45S"), 45);
  assert.equal(parseDuration("PT1M5S"), 65);
  assert.equal(parseDuration("PT1H"), 3600);
  assert.equal(parseDuration("P0D"), 0);
  assert.equal(parseDuration("PT"), null);
  assert.equal(parseDuration("45"), null);
  assert.equal(parseDuration(undefined), null);
});
