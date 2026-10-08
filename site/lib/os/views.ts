// Read-only data for the Money OS screens (/os). Every number comes from a table and is computed in code; when a
// source cannot be read the field is null and the screen shows DATA UNAVAILABLE. No model calls here.
import type { Db } from "../jarvis/db.ts";
import { startOfDayIso } from "../jarvis/db.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { labelsForRow, listRanked } from "./opportunities.ts";
import { DIMENSIONS, explain, subScoresFromRow } from "./score.ts";
import type { Dimension } from "./score.ts";
import { dayKey } from "./usage.ts";
import { EDITABLE_KEYS, LIMITS, effectiveConfig } from "./settings.ts";

type Row = Record<string, unknown>;
const TZ = (OS_CONFIG as unknown as { timezone: string }).timezone;

const num = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
};
const money = (v: number): number => Math.round(v * 100) / 100;
const micro = (v: number): number => Math.round(v * 1e6) / 1e6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function safe<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null;
  }
}

export async function opportunitiesView(db: Db, q: URLSearchParams) {
  const items = await safe(() => listRanked(db, { status: q.get("status") ?? undefined, limit: 100 }));
  return { items };
}

export async function opportunityDetail(db: Db, id: string) {
  if (!UUID.test(id)) return null;
  const rows = await db.select<Row>("opportunities", "*", [["id", "eq", id]], undefined, 1);
  if (!rows.length) return null;
  const r = rows[0];
  const evidence = await db.select<Row>("opportunity_evidence", "kind,claim,source_url,source_domain,observed_at", [["opportunity_id", "eq", id]], "observed_at.desc", 200);
  const s = subScoresFromRow(r);
  const reasons = (r.score_reasons ?? {}) as Partial<Record<Dimension, string>>;
  return {
    id: r.id, name: r.name, slug: r.slug, category: r.category, status: r.status, problem: r.problem ?? null,
    audience: r.audience ?? null, monetization: r.monetization ?? [], validationDifficulty: r.validation_difficulty ?? null,
    daysToFirstDollar: r.est_days_to_first_dollar ?? null, updatedAt: r.updated_at,
    ...labelsForRow(r),
    scores: DIMENSIONS.map((d) => ({ dimension: d, value: s[d] ?? null, reason: reasons[d] ?? null })),
    why: explain(s, reasons),
    evidence,
  };
}

export async function experimentsView(db: Db) {
  const items = await safe(() => db.select<Row>("experiments", "id,name,status,hypothesis,success_metric,target,budget_usd,started_at,ended_at,result_note,opportunity_id", [], "started_at.desc", 100));
  const byStatus: Record<string, number> = {};
  for (const e of items ?? []) byStatus[String(e.status)] = (byStatus[String(e.status)] ?? 0) + 1;
  return { items, byStatus: items ? byStatus : null };
}

/**
 * Revenue by venture and month. Agency revenue = Stripe payments whose event was LIVE mode (sandbox test
 * payments never count). Other ventures = revenue_entries. Profit = revenue - recorded cost.
 */
export async function revenueView(db: Db, now: number) {
  const payments = await safe(() => db.select<Row>("payments", "amount,status,created_at,stripe_event_id,type", [["status", "eq", "paid"]], "created_at.desc", 1000));
  const liveEvents = await safe(() => db.select<Row>("stripe_events", "id", [["livemode", "eq", true]], undefined, 5000));
  const entries = await safe(() => db.select<Row>("revenue_entries", "venture,source,product,amount_usd,cost_usd,occurred_on,experiment_id", [], "occurred_on.desc", 2000));
  if (payments === null || liveEvents === null || entries === null) {
    return { ventures: null, months: null, totals: null, excludedTestPayments: null };
  }
  const live = new Set(liveEvents.map((e) => String(e.id)));
  const agency = payments.filter((p) => live.has(String(p.stripe_event_id)));
  const excludedTestPayments = payments.length - agency.length;

  const ventures = new Map<string, { venture: string; revenue: number; cost: number }>();
  const months = new Map<string, { month: string; revenue: number; cost: number }>();
  const add = (venture: string, month: string, revenue: number, cost: number) => {
    const v = ventures.get(venture) ?? { venture, revenue: 0, cost: 0 };
    v.revenue += revenue; v.cost += cost; ventures.set(venture, v);
    const m = months.get(month) ?? { month, revenue: 0, cost: 0 };
    m.revenue += revenue; m.cost += cost; months.set(month, m);
  };
  for (const p of agency) add("LaunchPad Local agency", dayKey(Date.parse(String(p.created_at)), TZ).slice(0, 7), num(p.amount), 0);
  for (const e of entries) add(String(e.venture), String(e.occurred_on).slice(0, 7), num(e.amount_usd), num(e.cost_usd));

  const fin = <T extends { revenue: number; cost: number }>(x: T) => ({ ...x, revenue: money(x.revenue), cost: money(x.cost), profit: money(x.revenue - x.cost) });
  const vs = [...ventures.values()].map(fin).sort((a, b) => b.revenue - a.revenue);
  const ms = [...months.values()].map(fin).sort((a, b) => b.month.localeCompare(a.month));
  const thisMonth = dayKey(now, TZ).slice(0, 7);
  const total = vs.reduce((a, v) => ({ revenue: a.revenue + v.revenue, cost: a.cost + v.cost }), { revenue: 0, cost: 0 });
  return {
    ventures: vs,
    months: ms,
    totals: { ...fin(total), thisMonth: money(ms.find((m) => m.month === thisMonth)?.revenue ?? 0) },
    excludedTestPayments,
  };
}

/** AI cost: today, this month, last 30 days, by task, per opportunity and per experiment, and the daily budget. */
export async function costView(db: Db, now: number) {
  const today = dayKey(now, TZ);
  const month = today.slice(0, 7);
  const daily = await safe(() => db.select<Row>("ai_cost_daily", "day,calls,input_tokens,output_tokens,cost_usd,any_estimated", [["day", "gte", `${month}-01`]], "day.desc", 31));
  const monthStart = startOfDayIso(TZ, new Date(now), Number(today.slice(8, 10)) - 1); // local midnight on the 1st
  const BUDGETS = (await effectiveConfig(db)).budgets;
  const usage = await safe(() => db.select<Row>("ai_usage", "task,model,input_tokens,output_tokens,est_cost_usd,estimated,opportunity_id,experiment_id,ok", [["at", "gte", monthStart]], "at.desc", 5000));
  if (daily === null || usage === null) return { today: null, month: null, budget: { perDayUsd: BUDGETS.per_day_usd }, byTask: null, perOpportunity: null, perExperiment: null, days: null };

  const t = daily.find((d) => String(d.day) === today);
  const sum = (rows: Row[], k: string) => rows.reduce((a, r) => a + num(r[k]), 0);
  const group = (key: string) => {
    const m = new Map<string, { key: string; calls: number; costUsd: number }>();
    for (const u of usage) {
      const k = u[key];
      if (k === null || k === undefined || k === "") continue;
      const g = m.get(String(k)) ?? { key: String(k), calls: 0, costUsd: 0 };
      g.calls += 1; g.costUsd += num(u.est_cost_usd); m.set(String(k), g);
    }
    return [...m.values()].map((g) => ({ ...g, costUsd: micro(g.costUsd) })).sort((a, b) => b.costUsd - a.costUsd);
  };
  const todayCost = micro(num(t?.cost_usd));
  return {
    today: { costUsd: todayCost, calls: num(t?.calls), estimated: Boolean(t?.any_estimated) },
    month: {
      costUsd: micro(sum(daily, "cost_usd")), calls: sum(daily, "calls"),
      inputTokens: sum(daily, "input_tokens"), outputTokens: sum(daily, "output_tokens"),
      estimated: daily.some((d) => Boolean(d.any_estimated)),
    },
    budget: { perDayUsd: BUDGETS.per_day_usd, usedToday: todayCost, pct: BUDGETS.per_day_usd ? Math.min(100, Math.round((todayCost / BUDGETS.per_day_usd) * 100)) : null },
    byTask: group("task"),
    perOpportunity: group("opportunity_id"),
    perExperiment: group("experiment_id"),
    days: daily.map((d) => ({ day: String(d.day), calls: num(d.calls), costUsd: micro(num(d.cost_usd)), estimated: Boolean(d.any_estimated) })),
  };
}

export async function activityView(db: Db) {
  const items = await safe(() => db.select<Row>("activity", "at,actor,action,subject_type,subject_id,detail", [], "at.desc", 100));
  return { items };
}

/** Settings: effective budgets (yaml + owner overrides), yaml defaults, edit limits, prices, scoring, cache. No secrets. */
export async function settingsView(db: Db | null = null) {
  const c = OS_CONFIG as unknown as Row;
  const budgets = (await effectiveConfig(db)).budgets;
  return {
    timezone: c.timezone, budgets, defaults: c.budgets, editable: EDITABLE_KEYS.map((k) => ({ name: k, ...LIMITS[k] })),
    canEdit: db !== null, prices: c.prices, webSearchUsd: c.web_search_usd, cache: c.cache, score: c.score,
  };
}

export const VIEWS = ["opportunities", "opportunity", "experiments", "revenue", "cost", "activity", "settings"] as const;
export type View = (typeof VIEWS)[number];

export async function loadView(view: string, db: Db | null, q: URLSearchParams, now: number): Promise<{ status: number; body: unknown }> {
  if (!(VIEWS as readonly string[]).includes(view)) return { status: 404, body: { ok: false, error: "unknown view" } };
  if (view === "settings") return { status: 200, body: { ok: true, ...(await settingsView(db)) } };
  if (!db) return { status: 503, body: { ok: false, error: "database not configured" } };
  switch (view as View) {
    case "opportunities": return { status: 200, body: { ok: true, ...(await opportunitiesView(db, q)) } };
    case "opportunity": {
      const d = await safe(() => opportunityDetail(db, q.get("id") ?? ""));
      return d ? { status: 200, body: { ok: true, item: d } } : { status: 404, body: { ok: false, error: "not found" } };
    }
    case "experiments": return { status: 200, body: { ok: true, ...(await experimentsView(db)) } };
    case "revenue": return { status: 200, body: { ok: true, ...(await revenueView(db, now)) } };
    case "cost": return { status: 200, body: { ok: true, ...(await costView(db, now)) } };
    default: return { status: 200, body: { ok: true, ...(await activityView(db)) } };
  }
}
