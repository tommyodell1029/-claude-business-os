// "What should we do next to make money?" (revised master prompt §55). Shared by the /os Command screen and ULTRON's
// what_next tool. Every item and the recommended action are chosen by fixed rules in code from stored data; the
// model only phrases the result.
import type { Db } from "../jarvis/db.ts";
import { monetizationView } from "./monetization.ts";
import { listRanked } from "./opportunities.ts";
import { effectiveConfig } from "./settings.ts";
import { spentToday } from "./usage.ts";
import { experimentChecks } from "./decide.ts";

export const DECISION_AFTER_DAYS = 7;

export type NextAction = { kind: "resume_ai" | "decide_experiment" | "start_experiment" | "research" | "run_radar" | "none"; text: string; targetId: string | null };

export async function whatNext(db: Db, now: number) {
  const cutoff = new Date(now - DECISION_AFTER_DAYS * 86_400_000).toISOString();
  const waiting = await db.select<Record<string, unknown>>("experiments", "id,name,status,target,started_at", [["status", "eq", "validating"], ["started_at", "lte", cutoff]], "started_at.asc", 5);
  const ranked = await listRanked(db, { limit: 100 });
  const best = ranked.filter((o) => o.overall !== null).slice(0, 3);
  const unresearched = ranked.filter((o) => o.status === "discovered").sort((a, b) => b.evidenceCount - a.evidenceCount || b.domains - a.domains).slice(0, 3);
  const cfg = await effectiveConfig(db);
  const spent = await spentToday(db, now, cfg);

  // Highest-potential opportunity: top of the code ranking, with its cheapest validation if research produced one.
  let top: Record<string, unknown> | null = null;
  if (best[0]) {
    const row = (await db.select<Record<string, unknown>>("opportunities", "*", [["id", "eq", best[0].id]], undefined, 1))[0];
    const m = row ? monetizationView(row) : null;
    top = { id: best[0].id, name: best[0].name, score: best[0].overall, confidence: best[0].confidence, labels: best[0].labels.text || null, status: best[0].status, models: m?.models.slice(0, 3) ?? [], cheapestValidation: m?.cheapestValidation ?? null };
  }

  let action: NextAction = { kind: "none", text: "Nothing needs a decision right now.", targetId: null };
  if (cfg.aiPaused) action = { kind: "resume_ai", text: "AI is stopped. Resume it in Settings to research or run Radar.", targetId: null };
  else if (waiting[0]) {
    const c = (await experimentChecks(db, now, String(waiting[0].id)).catch(() => []))[0];
    action = { kind: "decide_experiment", text: `"${String(waiting[0].name)}": ${c ? c.suggestion.text : `validating for over ${DECISION_AFTER_DAYS} days. Mark it validated or killed.`}`, targetId: String(waiting[0].id) };
  }
  else if (top && ["researched", "validation_ready"].includes(String(top.status))) {
    const v = top.cheapestValidation as { description: string } | null;
    action = { kind: "start_experiment", text: `Start a validation experiment for "${String(top.name)}"${v ? `: ${v.description}` : "."}`, targetId: String(top.id) };
  } else if (unresearched[0]) action = { kind: "research", text: `Research "${unresearched[0].name}" (${unresearched[0].evidenceCount} evidence items so far).`, targetId: unresearched[0].id };
  else if (!ranked.length) action = { kind: "run_radar", text: "Run Money Radar to find the first opportunities.", targetId: null };

  return {
    recommended: action,
    top_opportunity: top,
    experiments_needing_decision: waiting.map((e) => ({ ...e, note: `validating for more than ${DECISION_AFTER_DAYS} days: decide validated or killed` })),
    best_opportunities: best.map((o) => ({ id: o.id, name: o.name, score: o.overall, confidence: o.confidence, labels: o.labels.text || null, status: o.status })),
    research_next: unresearched.map((o) => ({ id: o.id, name: o.name, evidence: o.evidenceCount, sources: o.domains })),
    ai_budget_left_today: spent === null ? null : Math.max(0, Math.round((cfg.budgets.per_day_usd - spent) * 100) / 100),
    ai_paused: cfg.aiPaused,
  };
}
