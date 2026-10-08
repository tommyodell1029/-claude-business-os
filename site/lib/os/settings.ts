// Owner-editable Money OS budgets (slice 5). Defaults and hard limits come from config/money_os.yaml
// (`budgets`, `editable_budgets`); overrides live in public.os_settings. Every value is checked against the limits
// when saved and again when read, so a bad row can never raise a budget past its ceiling.
import type { Db } from "../jarvis/db.ts";
import { OS_CONFIG } from "./config.generated.ts";
import type { OsConfig } from "./usage.ts";
import { logActivity, usd } from "./usage.ts";

type Limits = Record<string, { min: number; max: number }>;
const BASE = OS_CONFIG as unknown as OsConfig & { editable_budgets: Limits };
export const EDITABLE_KEYS = ["per_day_usd", "per_turn_usd", "per_research_run_usd"] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];
export const LIMITS = BASE.editable_budgets as Record<EditableKey, { min: number; max: number }>;

const isKey = (k: unknown): k is EditableKey => typeof k === "string" && (EDITABLE_KEYS as readonly string[]).includes(k);
const inRange = (k: EditableKey, v: number): boolean => Number.isFinite(v) && v >= LIMITS[k].min && v <= LIMITS[k].max;

export type EffectiveConfig = OsConfig & { aiPaused: boolean };

/**
 * The config with the owner's stored overrides applied. Unreadable table or bad rows -> the yaml defaults.
 * `aiPaused` is the emergency stop: when set, every model call is refused before it is made.
 */
export async function effectiveConfig(db: Db | null): Promise<EffectiveConfig> {
  const budgets = { ...BASE.budgets };
  let aiPaused = false;
  if (db) {
    try {
      const rows = await db.select<{ key: string; value: number | string }>("os_settings", "key,value", [], undefined, 20);
      for (const r of rows) {
        const v = Number(r.value);
        if (r.key === "ai_paused") aiPaused = v === 1;
        else if (isKey(r.key) && inRange(r.key, v)) budgets[r.key] = v;
      }
    } catch {
      // keep defaults
    }
  }
  return { ...BASE, budgets, aiPaused };
}

/** Emergency stop on/off. Logged; takes effect on the next model call (in-flight calls finish and are logged). */
export async function setAiPaused(db: Db, email: string, paused: boolean, now: number): Promise<boolean> {
  const at = new Date(now).toISOString();
  const value = paused ? 1 : 0;
  const updated = await db.update("os_settings", [["key", "eq", "ai_paused"]], { value, updated_at: at, updated_by: email });
  if (!updated.length) await db.insert("os_settings", { key: "ai_paused", value, updated_at: at, updated_by: email });
  await logActivity(db, "owner", paused ? "ai_stopped" : "ai_resumed", paused ? "Emergency stop: all AI calls refused until resumed" : "AI calls resumed");
  return (await effectiveConfig(db)).aiPaused;
}

export type SettingsPatch = Partial<Record<EditableKey, number>>;

/** Validates a patch from the Settings screen: known keys only, numbers within the yaml limits, cents precision. */
export function validatePatch(raw: unknown): { ok: true; value: SettingsPatch } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "budgets must be an object" };
  const out: SettingsPatch = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKey(k)) return { ok: false, error: `${k} cannot be edited` };
    if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: `${k} must be a number` };
    const cents = Math.round(v * 100) / 100;
    if (!inRange(k, cents)) return { ok: false, error: `${k} must be from ${usd(LIMITS[k].min)} to ${usd(LIMITS[k].max)}` };
    out[k] = cents;
  }
  if (!Object.keys(out).length) return { ok: false, error: "nothing to change" };
  return { ok: true, value: out };
}

/** Saves validated overrides (insert or update per key) and logs each change to activity. */
export async function saveBudgets(db: Db, email: string, patch: SettingsPatch, now: number): Promise<OsConfig["budgets"]> {
  const before = (await effectiveConfig(db)).budgets;
  const at = new Date(now).toISOString();
  for (const k of EDITABLE_KEYS) {
    const v = patch[k];
    if (v === undefined || v === before[k]) continue;
    const updated = await db.update("os_settings", [["key", "eq", k]], { value: v, updated_at: at, updated_by: email });
    if (!updated.length) await db.insert("os_settings", { key: k, value: v, updated_at: at, updated_by: email });
    await logActivity(db, "owner", "settings_changed", `${k}: ${usd(before[k])} -> ${usd(v)}`);
  }
  return (await effectiveConfig(db)).budgets;
}
