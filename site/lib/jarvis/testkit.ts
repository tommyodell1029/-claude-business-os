// Test helpers: an in-memory stand-in for the Supabase REST tables Jarvis touches. Used only by *.test.ts.
import type { Db, Filter } from "./db.ts";

type Row = Record<string, unknown>;

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([col, op, v]) => {
    const x = row[col];
    if (op === "eq") return String(x) === String(v);
    if (op === "is") return v === null ? x === null || x === undefined : x === v;
    const a = typeof x === "string" && typeof v === "string" ? x.localeCompare(v) : Number(x) - Number(v);
    return op === "gt" ? a > 0 : op === "gte" ? a >= 0 : op === "lt" ? a < 0 : a <= 0;
  });
}

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const log: string[] = [];
  let n = 0;
  const t = (name: string) => (tables[name] ??= []);
  const db: Db = {
    async select<T>(table: string, select: string, filters: Filter[] = [], _order?: string, limit = 20) {
      log.push(`select ${table}`);
      return t(table)
        .filter((r) => matches(r, filters))
        .slice(0, limit)
        .map((r) => {
          const out: Row = { ...r };
          // emulate the `to:payload->>to` alias used by outreach queries
          if (select.includes("to:payload->>to")) out.to = (r.payload as Row | undefined)?.to ?? null;
          return out;
        }) as T[];
    },
    async count(table: string, filters: Filter[] = []) {
      log.push(`count ${table}`);
      return t(table).filter((r) => matches(r, filters)).length;
    },
    async insert<T>(table: string, row: Row) {
      log.push(`insert ${table}`);
      n += 1;
      const full = { id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, ...row };
      t(table).push(full);
      return full as T;
    },
    async update<T>(table: string, filters: Filter[], patch: Row) {
      log.push(`update ${table}`);
      const hit = t(table).filter((r) => matches(r, filters));
      for (const r of hit) Object.assign(r, patch);
      return hit as T[];
    },
  };
  return { db, tables, log };
}

export const OWNER = "owner@launchpadlocal.org";
export const ENV = { JARVIS_OWNER_EMAIL: OWNER, SUPABASE_URL: "https://sb.example", SUPABASE_ANON_KEY: "anon-test" };
