// Money OS research engine and Money Radar (docs/money-os/PHASE_1_PLAN.md, slice 4).
// Order of work: cache -> budget check -> one model call with capped web search -> code validation -> storage.
// Guards: every evidence link must be a URL that came back from this call's own web searches (anything else is
// dropped, so invented sources never get in); sub-scores go through validateProposal; scores, confidence and
// labels are computed in code; every call is logged to ai_usage; a budget refusal stops the run before the call.
import { createHash } from "node:crypto";
import type { Db } from "../jarvis/db.ts";
import { anthropicKey, model } from "../jarvis/models.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { addEvidence, applyProposal, createOpportunity } from "./opportunities.ts";
import type { EvidenceInput } from "./opportunities.ts";
import { DIMENSIONS, validateProposal } from "./score.ts";
import type { ApiUsage, OsConfig } from "./usage.ts";
import { costOf, logActivity, logUsage, spentToday, tokensFrom, usd } from "./usage.ts";

type Cfg = OsConfig & {
  cache: { research_ttl_days: number };
  radar: { role: string; max_searches: number; max_opportunities: number; max_tokens: number; categories: Record<string, string> };
  research: { role: string; max_searches: number; max_tokens: number };
};
const CFG = OS_CONFIG as unknown as Cfg;

export type Ctx = { db: Db; env: Record<string, string | undefined>; fetchImpl: typeof fetch; now: number };
export type Hit = { url: string; title: string };
type Block = { type: string; text?: string; content?: unknown };

/** Assumed input tokens one basic web search adds to the context; used only for the pre-call worst-case estimate. */
const TOKENS_PER_SEARCH = 12_000;
const MAX_CONTINUATIONS = 2;

export const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Comparable form of a URL: lowercase host without www, path without trailing slash, no query or fragment. */
export function urlKey(u: string): string | null {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return null;
    return `${x.hostname.toLowerCase().replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** The JSON object in a model reply (fenced or bare). null when there is none or it does not parse. */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidates = [fenced, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)].filter((c): c is string => !!c && c.trim().startsWith("{"));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Search hits returned by the API in a response (web_search_tool_result blocks with a list of results). */
export function hitsFrom(content: Block[]): Hit[] {
  const out: Hit[] = [];
  for (const b of content) {
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content as { type?: string; url?: unknown; title?: unknown }[]) {
      if (r?.type === "web_search_result" && typeof r.url === "string") out.push({ url: r.url, title: typeof r.title === "string" ? r.title : "" });
    }
  }
  return out;
}

/** Keeps only evidence whose link is one of this call's search results. Returns kept items and how many were dropped. */
export function groundEvidence(items: unknown, hits: Hit[]): { kept: EvidenceInput[]; dropped: number } {
  const allowed = new Set(hits.map((h) => urlKey(h.url)).filter(Boolean));
  const kept: EvidenceInput[] = [];
  let dropped = 0;
  for (const e of Array.isArray(items) ? items.slice(0, 20) : []) {
    const r = e as Record<string, unknown>;
    const key = typeof r?.source_url === "string" ? urlKey(r.source_url) : null;
    if (!key || !allowed.has(key) || typeof r.claim !== "string" || typeof r.kind !== "string") {
      dropped += 1;
      continue;
    }
    kept.push({ kind: r.kind, claim: r.claim, source_url: r.source_url as string });
  }
  return { kept, dropped };
}

/**
 * Pre-call worst case in USD: every allowed search used (each adding TOKENS_PER_SEARCH input tokens), max output,
 * and one pause_turn continuation resending it all. The per-run cap is enforced again after every request.
 */
export function worstCase(modelId: string, maxSearches: number, maxTokens: number, promptChars: number, cfg: Cfg = CFG): number {
  const tokens = { input: Math.ceil(promptChars / 4) + maxSearches * TOKENS_PER_SEARCH, output: maxTokens, cacheRead: 0, cacheWrite: 0, webSearches: 0 };
  const searchFees = maxSearches * (cfg.web_search_usd ?? 0.01);
  return costOf(modelId, tokens, cfg).usd * 2 + searchFees;
}

type CallOut = { ok: true; text: string; hits: Hit[]; spent: number } | { ok: false; error: string; spent: number; refused?: boolean };

/**
 * One model call with web search (basic tool, capped). Handles pause_turn by continuing up to MAX_CONTINUATIONS
 * times; every request is budget-checked first and logged after.
 */
export async function searchCall(
  ctx: Ctx,
  o: { task: string; role: string; system: string; prompt: string; maxSearches: number; maxTokens: number; runCapUsd: number; opportunityId?: string | null },
): Promise<CallOut> {
  const key = anthropicKey(ctx.env);
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY not set", spent: 0 };
  const modelId = model(o.role, "os");
  const dayBefore = await spentToday(ctx.db, ctx.now);
  const limitDay = CFG.budgets.per_day_usd;
  const worst = worstCase(modelId, o.maxSearches, o.maxTokens, o.system.length + o.prompt.length);
  if (worst > o.runCapUsd) return { ok: false, error: `run cap ${usd(o.runCapUsd)} is below this call's worst case ${usd(worst)}; raise the cap or lower max_searches`, spent: 0, refused: true };
  if (dayBefore !== null && dayBefore + worst > limitDay) {
    await logActivity(ctx.db, "system", "budget_stop", `${o.task} refused: today's ${usd(dayBefore)} + worst case ${usd(worst)} would pass the ${usd(limitDay)} daily budget`);
    return { ok: false, error: `today's AI budget would be exceeded (${usd(dayBefore)} spent of ${usd(limitDay)})`, spent: 0, refused: true };
  }

  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: o.prompt }];
  const hits: Hit[] = [];
  const texts: string[] = [];
  let spent = 0;
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const started = Date.now();
    let r: Response;
    try {
      r = await ctx.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: modelId, max_tokens: o.maxTokens, system: o.system, messages,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: o.maxSearches }],
        }),
        signal: AbortSignal.timeout(55_000),
      });
    } catch (e) {
      return { ok: false, error: `model request failed: ${(e as Error).name}`, spent };
    }
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 300).replace(/\s+/g, " ");
      await logUsage(ctx.db, { task: o.task, component: "os", model: modelId, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 }, usd: 0, estimated: false, durationMs: Date.now() - started, ok: false, opportunityId: o.opportunityId });
      return { ok: false, error: `anthropic ${r.status}: ${detail}`, spent };
    }
    const data = (await r.json()) as { content?: Block[]; stop_reason?: string; usage?: ApiUsage };
    const content = Array.isArray(data.content) ? data.content : [];
    const { tokens, estimated } = tokensFrom(data.usage, { inChars: o.system.length + JSON.stringify(messages).length, outChars: JSON.stringify(content).length });
    const cost = costOf(modelId, tokens);
    spent += cost.usd;
    await logUsage(ctx.db, { task: o.task, component: "os", model: modelId, tokens, usd: cost.usd, estimated: estimated || cost.estimated, durationMs: Date.now() - started, ok: true, opportunityId: o.opportunityId });
    hits.push(...hitsFrom(content));
    texts.push(...content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text as string));
    if (data.stop_reason !== "pause_turn") break;
    if (spent >= o.runCapUsd) return { ok: false, error: `run cap ${usd(o.runCapUsd)} reached`, spent, refused: true };
    messages.push({ role: "assistant", content }); // resend the paused turn unchanged to continue
  }
  return { ok: true, text: texts.join("\n"), hits, spent };
}

const RULES = `Rules:
- Use web search. Only report what the search results show. Never invent names, numbers, prices or links.
- Every evidence item needs "source_url" copied exactly from one of your search results. Items without one are discarded.
- Claims are short and factual (under 200 characters), for example "Templates in this niche list at $19 to $49 on the marketplace".
- Evidence "kind" is one of: demand, trend, competition, pricing, affiliate, audience, other.
- Return ONLY one JSON object, no prose before or after it.`;

async function cached(db: Db, queryHash: string, now: number): Promise<Record<string, unknown> | null> {
  const rows = await db.select<{ result: Record<string, unknown>; expires_at: string; status: string }>(
    "research_runs", "result,expires_at,status", [["query_hash", "eq", queryHash], ["status", "eq", "ok"]], "created_at.desc", 1,
  );
  return rows.length && Date.parse(rows[0].expires_at) > now ? rows[0].result : null;
}

async function saveRun(db: Db, row: { kind: "radar_sweep" | "opportunity_research"; query: string; queryHash: string; status: "ok" | "failed" | "budget_refused"; result: unknown; opportunityId?: string | null; now: number }) {
  try {
    await db.insert("research_runs", {
      kind: row.kind, query: row.query.slice(0, 500), query_hash: row.queryHash, status: row.status, result: row.result,
      opportunity_id: row.opportunityId ?? null,
      expires_at: new Date(row.now + (row.status === "ok" ? CFG.cache.research_ttl_days : 0) * 86_400_000).toISOString(),
    });
  } catch {
    // the run result is still returned to the owner
  }
}

export type RadarResult = {
  ok: boolean; category: string; cached?: boolean; error?: string;
  created: number; existing: number; evidenceAdded: number; evidenceDropped: number; skipped: number; spentUsd: number;
};

/** Money Radar for one category. Owner-triggered; the UI walks the categories one request at a time. */
export async function radarCategory(ctx: Ctx, category: string, opts: { force?: boolean } = {}): Promise<RadarResult> {
  const R = CFG.radar;
  const empty = { created: 0, existing: 0, evidenceAdded: 0, evidenceDropped: 0, skipped: 0, spentUsd: 0 };
  const desc = R.categories[category];
  if (!desc) return { ok: false, category, error: "unknown category", ...empty };
  const query = `radar|${category}|${desc}`;
  const qh = sha(query);
  if (!opts.force) {
    const hit = await cached(ctx.db, qh, ctx.now);
    if (hit) return { ...(hit as unknown as RadarResult), ok: true, cached: true, spentUsd: 0 };
  }
  const system = "You research online income opportunities for a solo founder. You are careful, factual and skeptical of hype.";
  const prompt = `Category: ${desc}.
Find up to ${R.max_opportunities} specific online income opportunities in this category that people are actively looking for or paying for right now. Prefer concrete, narrow ideas a solo founder could test within weeks (for example a specific product for a specific audience), not broad trends.

Return JSON:
{"opportunities":[{"name":"short specific name","problem":"one sentence","audience":"who pays","monetization":["e.g. one-time sale","subscription","affiliate commission"],"evidence":[{"kind":"demand","claim":"...","source_url":"..."}]}]}

Give each opportunity 2 to 4 evidence items.
${RULES}`;
  const call = await searchCall(ctx, { task: "radar_sweep", role: R.role, system, prompt, maxSearches: R.max_searches, maxTokens: R.max_tokens, runCapUsd: CFG.budgets.per_research_run_usd });
  if (!call.ok) {
    await saveRun(ctx.db, { kind: "radar_sweep", query, queryHash: qh, status: call.refused ? "budget_refused" : "failed", result: { error: call.error }, now: ctx.now });
    await logActivity(ctx.db, "radar", "radar_failed", `${category}: ${call.error}`);
    return { ok: false, category, error: call.error, ...empty, spentUsd: call.spent };
  }
  const parsed = extractJson(call.text);
  const list = Array.isArray(parsed?.opportunities) ? (parsed.opportunities as Record<string, unknown>[]).slice(0, R.max_opportunities) : [];
  const out = { ...empty, spentUsd: call.spent };
  for (const o of list) {
    const { kept, dropped } = groundEvidence(o?.evidence, call.hits);
    out.evidenceDropped += dropped;
    if (!kept.length) { out.skipped += 1; continue; } // no grounded evidence: not stored
    const c = await createOpportunity(ctx.db, {
      name: String(o.name ?? ""), category, problem: typeof o.problem === "string" ? o.problem : "",
      audience: typeof o.audience === "string" ? o.audience : "",
      monetization: Array.isArray(o.monetization) ? o.monetization.filter((m): m is string => typeof m === "string") : [],
    });
    if ("error" in c) { out.skipped += 1; continue; }
    if (c.created) out.created += 1; else out.existing += 1;
    const ev = await addEvidence(ctx.db, String(c.opportunity.id), kept, ctx.now);
    out.evidenceAdded += ev.added;
  }
  const result: RadarResult = { ok: true, category, ...out };
  await saveRun(ctx.db, { kind: "radar_sweep", query, queryHash: qh, status: "ok", result, now: ctx.now });
  await logActivity(ctx.db, "radar", "radar_sweep", `${category}: ${out.created} new, ${out.existing} already known, ${out.evidenceAdded} evidence added, ${out.evidenceDropped} ungrounded dropped, ${usd(out.spentUsd)}`);
  return result;
}

const RUBRIC = `Score each dimension 0-10 ONLY when your evidence supports it, with a one-line reason that refers to that evidence; leave it out otherwise.
- demand: how many people actively want or pay for this (10 = strong, repeated evidence of buying).
- trend: momentum (10 = clearly growing now).
- competition: how crowded (10 = very crowded; higher is worse).
- monetization: how clearly people pay and at what price (10 = proven prices).
- recurring: potential for repeat or subscription revenue.
- affiliate: affiliate commission potential.
- content: potential to market with organic content.
- automation: how much of delivery can be automated.
- speed: how fast a first sale is possible (10 = days).
- startup_cost: money needed to start (10 = expensive; higher is worse).
- tech_difficulty: build difficulty (10 = very hard; higher is worse).
- acquisition_difficulty: difficulty of reaching buyers (10 = very hard; higher is worse).
- retention: likelihood customers stay or return.
- market_size: size of the reachable market.
- defensibility: how hard it is to copy.
Also give validation_difficulty (integer 1-10, 1 = a landing page test in a day) and est_days_to_first_dollar (integer), only if the evidence supports an estimate.`;

export type ResearchResult = {
  ok: boolean; id: string; cached?: boolean; error?: string;
  evidenceAdded: number; evidenceDropped: number; scored: number; spentUsd: number;
};

/** Deep research on one opportunity: grounded evidence, then a validated sub-score proposal, then code rescoring. */
export async function researchOpportunity(ctx: Ctx, id: string, opts: { force?: boolean } = {}): Promise<ResearchResult> {
  const empty = { evidenceAdded: 0, evidenceDropped: 0, scored: 0, spentUsd: 0 };
  const rows = await ctx.db.select<Record<string, unknown>>("opportunities", "id,name,category,problem,audience,status", [["id", "eq", id]], undefined, 1);
  if (!rows.length) return { ok: false, id, error: "not found", ...empty };
  const o = rows[0];
  const query = `research|${id}`;
  const qh = sha(query);
  if (!opts.force) {
    const hit = await cached(ctx.db, qh, ctx.now);
    if (hit) return { ...(hit as unknown as ResearchResult), ok: true, cached: true, spentUsd: 0 };
  }
  const RS = CFG.research;
  const system = "You research online income opportunities for a solo founder. You are careful, factual and skeptical of hype.";
  const prompt = `Opportunity: ${String(o.name)}
Category: ${String(o.category)}
Problem: ${String(o.problem ?? "unknown")}
Audience: ${String(o.audience ?? "unknown")}

Research demand, competition, typical prices, affiliate programs and trend for this opportunity.
${RUBRIC}

Return JSON:
{"evidence":[{"kind":"demand","claim":"...","source_url":"..."}],"scores":{"demand":7},"reasons":{"demand":"..."},"validation_difficulty":3,"est_days_to_first_dollar":14}

Give 3 to 8 evidence items. Use only the dimension names listed above.
${RULES}`;
  const call = await searchCall(ctx, { task: "research", role: RS.role, system, prompt, maxSearches: RS.max_searches, maxTokens: RS.max_tokens, runCapUsd: CFG.budgets.per_research_run_usd, opportunityId: id });
  if (!call.ok) {
    await saveRun(ctx.db, { kind: "opportunity_research", query, queryHash: qh, status: call.refused ? "budget_refused" : "failed", result: { error: call.error }, opportunityId: id, now: ctx.now });
    await logActivity(ctx.db, "ultron", "research_failed", `${String(o.name)}: ${call.error}`);
    return { ok: false, id, error: call.error, ...empty, spentUsd: call.spent };
  }
  const parsed = extractJson(call.text) ?? {};
  const { kept, dropped } = groundEvidence(parsed.evidence, call.hits);
  const ev = kept.length ? await addEvidence(ctx.db, id, kept, ctx.now) : { added: 0 };
  // Only dimensions from the rubric; anything else would fail validation and discard the whole proposal.
  const dims = new Set<string>(DIMENSIONS);
  const pick = (v: unknown) => Object.fromEntries(Object.entries((v ?? {}) as Record<string, unknown>).filter(([k]) => dims.has(k)));
  const proposal = validateProposal({
    scores: pick(parsed.scores), reasons: pick(parsed.reasons),
    validation_difficulty: Number.isInteger(parsed.validation_difficulty) ? parsed.validation_difficulty : null,
    est_days_to_first_dollar: Number.isInteger(parsed.est_days_to_first_dollar) ? parsed.est_days_to_first_dollar : null,
  });
  let scored = 0;
  // Scores are accepted only when this run produced grounded evidence for them to rest on.
  if (proposal.ok && kept.length) {
    scored = Object.keys(proposal.value.scores).length;
    await applyProposal(ctx.db, id, proposal.value, ctx.now);
  }
  if (!o.status || o.status === "discovered") await ctx.db.update("opportunities", [["id", "eq", id]], { status: "researched" });
  const result: ResearchResult = { ok: true, id, evidenceAdded: ev.added, evidenceDropped: dropped, scored, spentUsd: call.spent };
  await saveRun(ctx.db, { kind: "opportunity_research", query, queryHash: qh, status: "ok", result, opportunityId: id, now: ctx.now });
  await logActivity(ctx.db, "ultron", "research", `${String(o.name)}: ${ev.added} evidence added, ${dropped} ungrounded dropped, ${scored} dimensions scored, ${usd(call.spent)}`);
  return result;
}

export const RADAR_CATEGORIES = (): { key: string; description: string }[] =>
  Object.entries(CFG.radar.categories).map(([key, description]) => ({ key, description }));
