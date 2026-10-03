// Fixed, parameterized PostgREST access for Jarvis (service role, server-side only). Callers pass validated values;
// every value is URL-encoded here. There is no way to send free-form SQL or a free-form filter.
type Env = Record<string, string | undefined>;

export type Db = ReturnType<typeof jarvisDb>;

export function dbConfig(env: Env): { url: string; key: string } | null {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return url && key ? { url, key } : null;
}

export type Filter = [column: string, op: "eq" | "gte" | "lte" | "lt" | "gt" | "is", value: string | number | boolean | null];

export function query(table: string, select: string, filters: Filter[] = [], order?: string, limit?: number): string {
  const p = new URLSearchParams();
  p.set("select", select);
  for (const [col, op, v] of filters) p.append(col, `${op}.${v === null ? "null" : String(v)}`);
  if (order) p.set("order", order);
  if (limit) p.set("limit", String(limit));
  return `${table}?${p.toString()}`;
}

export function jarvisDb(cfg: { url: string; key: string }, fetchImpl: typeof fetch = fetch) {
  const base = `${cfg.url}/rest/v1/`;
  const headers = { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, "content-type": "application/json" };
  const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const r = await fetchImpl(base + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`supabase ${init.method ?? "GET"} ${path.split("?")[0]} ${r.status}`);
    return r;
  };
  return {
    async select<T = Record<string, unknown>>(table: string, select: string, filters: Filter[] = [], order?: string, limit = 20): Promise<T[]> {
      const r = await call(query(table, select, filters, order, limit));
      return (await r.json()) as T[];
    },
    async count(table: string, filters: Filter[] = []): Promise<number> {
      const r = await call(query(table, "id", filters), { headers: { prefer: "count=exact", range: "0-0" } });
      const m = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "");
      if (!m) throw new Error(`supabase count ${table}: no content-range`);
      return Number(m[1]);
    },
    async insert<T = Record<string, unknown>>(table: string, row: Record<string, unknown>): Promise<T> {
      const r = await call(table, { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(row) });
      return ((await r.json()) as T[])[0];
    },
    /** PATCH rows matching all filters; returns the updated rows (empty when nothing matched). */
    async update<T = Record<string, unknown>>(table: string, filters: Filter[], patch: Record<string, unknown>): Promise<T[]> {
      if (!filters.length) throw new Error("update without filters refused");
      const r = await call(query(table, "*", filters), { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) });
      return (await r.json()) as T[];
    },
  };
}

/** Start of a calendar day in a time zone, as an ISO instant. daysAgo=0 -> today's local midnight. */
export function startOfDayIso(tz: string, now = new Date(), daysAgo = 0): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000; // local - UTC
  const localMidnightAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day - daysAgo);
  return new Date(localMidnightAsUtc - offsetMs).toISOString();
}

export const hoursAgoIso = (h: number, now = Date.now()): string => new Date(now - h * 3_600_000).toISOString();
