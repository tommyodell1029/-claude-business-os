// Money OS Social Radar (Phase 2 slice 1): what people watch about making money online, from the official
// YouTube Data API v3 only (no scraping, no browser automation; see docs/money-os/PHASE_2_PLAN.md).
// Order of work: emergency stop -> cache -> quota check -> API searches + video stats -> store the sweep ->
// one capped model call that only GROUPS the videos into opportunity ideas -> evidence written by code.
// Guards: every number (views, comments, views per day) comes from the API response and is formatted in code; the
// model may only cite videos by their list index, and an index that is not in the list is dropped. The API key is
// sent in a header (never in a URL, so it never lands in a log). Quota is counted from stored sweeps.
import type { Db } from "../jarvis/db.ts";
import { startOfDayIso } from "../jarvis/db.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { addEvidence, createOpportunity } from "./opportunities.ts";
import type { EvidenceInput } from "./opportunities.ts";
import { extractJson, searchCall, worstCase } from "./research.ts";
import type { Ctx } from "./research.ts";
import { effectiveConfig } from "./settings.ts";
import { logActivity, usd } from "./usage.ts";
import { model } from "../jarvis/models.ts";

type YtCfg = { daily_units_cap: number; window_days: number; per_query: number; region: string; language: string; queries: string[] };
type SocialCfg = { cache_hours: number; youtube: YtCfg; analysis: { role: string; max_tokens: number; max_videos: number; max_opportunities: number } };
const CFG = (OS_CONFIG as unknown as { timezone: string; social_radar: SocialCfg });
const S = CFG.social_radar;

export const CATEGORY = "youtube_trends";
const API = "https://www.googleapis.com/youtube/v3/";
const SEARCH_UNITS = 100;
const VIDEOS_UNITS_PER_50 = 1;
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

export type Signal = {
  id: string; title: string; channel: string; url: string; query: string;
  publishedAt: string; ageDays: number; views: number; likes: number | null; comments: number | null; viewsPerDay: number;
};

/** Units one sweep can use at most: every query searched, plus one videos.list call per 50 ids. */
export function plannedUnits(cfg: YtCfg = S.youtube): number {
  return cfg.queries.length * SEARCH_UNITS + Math.ceil((cfg.queries.length * cfg.per_query) / 50) * VIDEOS_UNITS_PER_50;
}

/** Worst-case model cost of the grouping call (no web search). */
export function analysisWorstCase(): number {
  return worstCase(model(S.analysis.role, "os"), 0, S.analysis.max_tokens, 1500 + S.analysis.max_videos * 220);
}

/** Quota units used today (owner's time zone), from stored sweeps. null when the table cannot be read. */
export async function unitsToday(db: Db, now: number): Promise<number | null> {
  try {
    const rows = await db.select<{ quota_units: number | string }>("social_sweeps", "quota_units", [["source", "eq", "youtube"], ["created_at", "gte", startOfDayIso(CFG.timezone, new Date(now))]], undefined, 200);
    return rows.reduce((s, r) => s + Number(r.quota_units ?? 0), 0);
  } catch {
    return null;
  }
}

const int = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

/** One video from a videos.list item. null when the item lacks an id, a title, a publish date or a view count. */
export function toSignal(item: unknown, query: string, now: number): Signal | null {
  const it = item as { id?: unknown; snippet?: Record<string, unknown>; statistics?: Record<string, unknown> };
  const id = typeof it?.id === "string" && VIDEO_ID.test(it.id) ? it.id : null;
  const title = typeof it?.snippet?.title === "string" ? it.snippet.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const published = Date.parse(String(it?.snippet?.publishedAt ?? ""));
  const views = int(it?.statistics?.viewCount);
  if (!id || !title || !Number.isFinite(published) || views === null) return null;
  const ageDays = Math.max(1, Math.round((now - published) / 86_400_000));
  return {
    id, title, query,
    channel: typeof it.snippet?.channelTitle === "string" ? it.snippet.channelTitle.slice(0, 120) : "",
    url: `https://www.youtube.com/watch?v=${id}`,
    publishedAt: new Date(published).toISOString(), ageDays, views,
    likes: int(it.statistics?.likeCount), comments: int(it.statistics?.commentCount),
    viewsPerDay: Math.round(views / ageDays),
  };
}

const fmt = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

/** The evidence line for one video. Every number in it comes from the API. */
export function evidenceFor(s: Signal): EvidenceInput {
  const comments = s.comments === null ? "" : `, ${fmt(s.comments)} comments`;
  return {
    kind: "demand",
    claim: `YouTube: "${s.title.slice(0, 120)}"${s.channel ? ` (${s.channel})` : ""} has ${fmt(s.views)} views in ${s.ageDays} days (about ${fmt(s.viewsPerDay)}/day)${comments}; found searching "${s.query}"`,
    source_url: s.url,
  };
}

type YtOut = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

async function yt(ctx: Ctx, key: string, path: string, params: Record<string, string>): Promise<YtOut> {
  try {
    const r = await ctx.fetchImpl(`${API}${path}?${new URLSearchParams(params)}`, {
      headers: { "x-goog-api-key": key, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const err = data.error as { errors?: { reason?: string }[]; message?: string } | undefined;
      const reason = err?.errors?.[0]?.reason ?? "";
      return { ok: false, error: `youtube ${path} ${r.status}${reason ? ` ${reason}` : ""}`.slice(0, 200) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `youtube ${path} request failed: ${(e as Error).name}` };
  }
}

export type SocialResult = {
  ok: boolean; cached?: boolean; error?: string; sweepId?: string; at?: string;
  videos: number; quotaUnits: number; created: number; existing: number; evidenceAdded: number; dropped: number; spentUsd: number;
  top: Signal[];
};

async function lastOkSweep(db: Db): Promise<Record<string, unknown> | null> {
  const rows = await db.select<Record<string, unknown>>("social_sweeps", "id,result,signals,created_at", [["source", "eq", "youtube"], ["status", "eq", "ok"]], "created_at.desc", 1);
  return rows[0] ?? null;
}

/** Latest stored videos, fastest-growing first. For the /os screen and ULTRON's social_trends read tool. */
export async function latestSignals(db: Db, limit = 15): Promise<{ at: string | null; signals: Signal[] } | null> {
  try {
    const row = await lastOkSweep(db);
    if (!row) return { at: null, signals: [] };
    const signals = (Array.isArray(row.signals) ? (row.signals as Signal[]) : []).slice().sort((a, b) => b.viewsPerDay - a.viewsPerDay).slice(0, limit);
    return { at: String(row.created_at), signals };
  } catch {
    return null;
  }
}

/** One Social Radar sweep. Owner-triggered (the /os button or a confirmed ULTRON action). */
export async function socialRadar(ctx: Ctx, opts: { force?: boolean } = {}): Promise<SocialResult> {
  const empty = { videos: 0, quotaUnits: 0, created: 0, existing: 0, evidenceAdded: 0, dropped: 0, spentUsd: 0, top: [] as Signal[] };
  const key = ctx.env.YOUTUBE_API_KEY?.trim();
  if (!key) return { ok: false, error: "YOUTUBE_API_KEY not set", ...empty };
  if ((await effectiveConfig(ctx.db)).aiPaused) return { ok: false, error: "AI is stopped (emergency stop); resume it in Settings", ...empty };

  if (!opts.force) {
    const last = await lastOkSweep(ctx.db).catch(() => null);
    if (last && Date.parse(String(last.created_at)) > ctx.now - S.cache_hours * 3_600_000) {
      const prev = (last.result ?? {}) as Partial<SocialResult>;
      const top = (Array.isArray(last.signals) ? (last.signals as Signal[]) : []).slice().sort((a, b) => b.viewsPerDay - a.viewsPerDay).slice(0, 10);
      return { ...empty, ...prev, ok: true, cached: true, spentUsd: 0, quotaUnits: 0, sweepId: String(last.id), at: String(last.created_at), top };
    }
  }

  const Y = S.youtube;
  const used = await unitsToday(ctx.db, ctx.now);
  if (used === null) return { ok: false, error: "could not read today's YouTube quota use", ...empty };
  const planned = plannedUnits(Y);
  if (used + planned > Y.daily_units_cap) {
    await logActivity(ctx.db, "radar", "social_refused", `YouTube quota: ${used} used today + ${planned} planned would pass the ${Y.daily_units_cap} cap`);
    return { ok: false, error: `today's YouTube quota cap would be passed (${used} of ${Y.daily_units_cap} units used; a sweep needs ${planned})`, ...empty };
  }

  // 1) searches (100 units each, counted even when a request fails: Google may still bill it)
  const after = new Date(ctx.now - Y.window_days * 86_400_000).toISOString();
  const searches = await Promise.all(Y.queries.map((q) => yt(ctx, key, "search", {
    part: "snippet", type: "video", order: "viewCount", maxResults: String(Y.per_query), publishedAfter: after,
    regionCode: Y.region, relevanceLanguage: Y.language, safeSearch: "moderate", q,
  })));
  let units = Y.queries.length * SEARCH_UNITS;
  const queryOf = new Map<string, string>();
  for (const [i, s] of searches.entries()) {
    if (!s.ok) continue;
    for (const it of (Array.isArray(s.data.items) ? s.data.items : []) as { id?: { videoId?: unknown } }[]) {
      const vid = it?.id?.videoId;
      if (typeof vid === "string" && VIDEO_ID.test(vid) && !queryOf.has(vid)) queryOf.set(vid, Y.queries[i]);
    }
  }
  const failed = searches.filter((s) => !s.ok) as { ok: false; error: string }[];

  // 2) real statistics for every video found (1 unit per 50)
  const ids = [...queryOf.keys()];
  const signals: Signal[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    units += VIDEOS_UNITS_PER_50;
    const v = await yt(ctx, key, "videos", { part: "snippet,statistics", id: chunk.join(","), maxResults: "50" });
    if (!v.ok) { failed.push(v); continue; }
    for (const it of (Array.isArray(v.data.items) ? v.data.items : [])) {
      const s = toSignal(it, queryOf.get(String((it as { id?: unknown }).id)) ?? "", ctx.now);
      if (s) signals.push(s);
    }
  }
  signals.sort((a, b) => b.viewsPerDay - a.viewsPerDay);

  if (!signals.length) {
    const error = failed.length ? failed[0].error : "no videos returned";
    await ctx.db.insert("social_sweeps", { source: "youtube", status: "failed", queries: Y.queries, quota_units: units, video_count: 0, error: error.slice(0, 500) }).catch(() => null);
    await logActivity(ctx.db, "radar", "social_failed", `YouTube: ${error} (${units} quota units)`);
    return { ok: false, error, ...empty, quotaUnits: units };
  }

  const sweep = await ctx.db.insert<{ id: string; created_at: string }>("social_sweeps", {
    source: "youtube", status: "ok", queries: Y.queries, quota_units: units, video_count: signals.length, signals,
  });

  // 3) the model groups the fastest-growing videos into opportunity ideas, citing them by index only
  const A = S.analysis;
  const shown = signals.slice(0, A.max_videos);
  const listing = shown.map((s, i) => `[${i}] "${s.title}" | ${s.channel} | ${fmt(s.views)} views in ${s.ageDays} days | ${s.comments === null ? "comments hidden" : `${fmt(s.comments)} comments`} | search: ${s.query}`).join("\n");
  const call = await searchCall(ctx, {
    task: "social_radar", role: A.role, maxSearches: 0, maxTokens: A.max_tokens, // per-run cap + daily budget apply
    system: "You analyze what people watch on YouTube about making money online, for a solo founder deciding what to sell. You are careful, factual and skeptical of hype.",
    prompt: `These YouTube videos from the last ${Y.window_days} days were found with the official YouTube API, sorted by views per day:
${listing}

Group them into up to ${A.max_opportunities} specific business or product opportunities that this audience is clearly interested in and that a small company could sell to them (a kit, template, course, tool, service or done-for-you setup). Cite the videos that show the interest by their [index].

Rules:
- Use only what the titles and numbers above show. Never invent numbers, prices, earnings or links.
- Do not promise income. Describe the problem the audience wants solved, not money they will make.
- Each opportunity cites 1 to 6 video indices from the list.
- Return ONLY one JSON object:
{"opportunities":[{"name":"short specific name","problem":"one sentence","audience":"who would pay","monetization":["e.g. one-time sale","subscription","service"],"videos":[0,3]}]}`,
  });

  const out = { ...empty, videos: signals.length, quotaUnits: units, spentUsd: call.spent, top: signals.slice(0, 10) };
  if (!call.ok) {
    const result = { ...out, ok: false, error: `videos saved; grouping failed: ${call.error}` };
    await ctx.db.update("social_sweeps", [["id", "eq", sweep.id]], { result: { ...result, top: undefined } }).catch(() => null);
    await logActivity(ctx.db, "radar", "social_sweep", `YouTube: ${signals.length} videos saved, grouping failed (${call.error}), ${units} quota units, ${usd(call.spent)}`);
    return { ...result, sweepId: sweep.id, at: sweep.created_at };
  }

  const parsed = extractJson(call.text);
  const list = Array.isArray(parsed?.opportunities) ? (parsed.opportunities as Record<string, unknown>[]).slice(0, A.max_opportunities) : [];
  for (const o of list) {
    const idx = [...new Set((Array.isArray(o?.videos) ? o.videos : []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < shown.length))].slice(0, 6);
    if (!idx.length) { out.dropped += 1; continue; } // no real video behind it: not stored (counted once)
    out.dropped += (Array.isArray(o?.videos) ? o.videos.length : 0) - idx.length; // citations of videos not in the list
    const c = await createOpportunity(ctx.db, {
      name: String(o.name ?? ""), category: CATEGORY,
      problem: typeof o.problem === "string" ? o.problem : "", audience: typeof o.audience === "string" ? o.audience : "",
      monetization: Array.isArray(o.monetization) ? o.monetization.filter((m): m is string => typeof m === "string") : [],
    });
    if ("error" in c) { out.dropped += 1; continue; }
    if (c.created) out.created += 1; else out.existing += 1;
    const ev = await addEvidence(ctx.db, String(c.opportunity.id), idx.map((i) => ({ ...evidenceFor(shown[i]), observed_at: new Date(ctx.now).toISOString() })), ctx.now);
    out.evidenceAdded += ev.added;
  }
  const result: SocialResult = { ...out, ok: true, sweepId: sweep.id, at: sweep.created_at };
  await ctx.db.update("social_sweeps", [["id", "eq", sweep.id]], { result: { ...result, top: undefined } }).catch(() => null);
  await logActivity(ctx.db, "radar", "social_sweep", `YouTube: ${signals.length} videos, ${out.created} new opportunities, ${out.existing} already known, ${out.evidenceAdded} evidence added, ${out.dropped} unsupported dropped, ${units} quota units, ${usd(call.spent)}`);
  return result;
}

/** What the /os screen and ULTRON show before a run: cost, quota and the key's presence (never the key). */
export async function socialStatus(db: Db, env: Record<string, string | undefined>, now: number) {
  return {
    keyConfigured: !!env.YOUTUBE_API_KEY?.trim(),
    queries: S.youtube.queries,
    windowDays: S.youtube.window_days,
    plannedUnits: plannedUnits(),
    unitsToday: await unitsToday(db, now),
    dailyUnitsCap: S.youtube.daily_units_cap,
    worstCaseUsd: Math.round(analysisWorstCase() * 1000) / 1000,
    cacheHours: S.cache_hours,
    latest: await latestSignals(db, 15),
  };
}
