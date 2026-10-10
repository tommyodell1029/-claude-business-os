"use client";
// Money OS (Phase 1): screens for opportunities, experiments, revenue, AI cost, activity and settings. Owner changes
// (Radar, research, experiments, kills, revenue, budgets, emergency stop) each sit behind a confirm dialog.
// Data comes only from /api/jarvis/os/* (same-origin, owner session cookies). ULTRON (chat + voice) is /jarvis.
// Every value is rendered as React text; links are shown only for http(s) URLs.
import { useCallback, useEffect, useState } from "react";

const UNAVAILABLE = "DATA UNAVAILABLE";
const TABS = [
  ["command", "Command"], ["opportunities", "Opportunities"], ["experiments", "Experiments"], ["revenue", "Revenue"],
  ["cost", "AI Cost"], ["activity", "Activity"], ["settings", "Settings"],
] as const;
type Tab = (typeof TABS)[number][0];
type Any = Record<string, unknown>;
type Load = { state: "loading" } | { state: "signin" } | { state: "error"; message: string } | { state: "ok"; data: Any };

const isTab = (s: string): s is Tab => TABS.some(([k]) => k === s);
const usd = (v: unknown, places = 2) => (typeof v === "number" ? `$${v.toFixed(places)}` : UNAVAILABLE);
const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : UNAVAILABLE);
const when = (v: unknown) => {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(t) : "";
};
const safeHref = (u: unknown): string | null => {
  if (typeof u !== "string") return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null;
  } catch {
    return null;
  }
};
const list = <T,>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null);

function useView(path: string, nonce: number): Load {
  // "loading" is derived (no synchronous setState in the effect): a result only counts for the request it answers.
  const key = `${path}|${nonce}`;
  const [res, setRes] = useState<{ key: string; load: Load } | null>(null);
  useEffect(() => {
    let live = true;
    const done = (load: Load) => { if (live) setRes({ key, load }); };
    fetch(`/api/jarvis/os/${path}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as Any;
        if (r.status === 401 || r.status === 403) done({ state: "signin" });
        else if (!r.ok || body.ok !== true) done({ state: "error", message: String(body.error ?? `HTTP ${r.status}`) });
        else done({ state: "ok", data: body });
      })
      .catch(() => done({ state: "error", message: "network error" }));
    return () => { live = false; };
  }, [key, path]);
  return res && res.key === key ? res.load : { state: "loading" };
}

function Shell({ load, children }: { load: Load; children: (d: Any) => React.ReactNode }) {
  if (load.state === "loading") return <p className="os-dim">Loading…</p>;
  if (load.state === "signin") {
    return (
      <div className="os-card">
        <p>Your sign-in has expired.</p>
        <button className="os-btn" onClick={() => window.location.reload()}>Sign in again</button>
      </div>
    );
  }
  if (load.state === "error") return <p className="os-warn">{UNAVAILABLE} ({load.message})</p>;
  return <>{children(load.data)}</>;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={`os-stat${value === UNAVAILABLE ? " na" : ""}`}>
      <span className="os-stat-label">{label}</span>
      <span className="os-stat-value">{value}</span>
      {note ? <span className="os-stat-note">{note}</span> : null}
    </div>
  );
}

function Chip({ tier, text }: { tier: number; text: string }) {
  if (!tier) return null;
  return <span className={`os-chip t${tier}`}>{text}</span>;
}

type Opp = {
  id: string; name: string; category: string; status: string; overall: number | null; confidence: number; evidenceCount: number; domains: number;
  labels: { tier: number; text: string; highScore?: boolean; strongEvidence?: boolean; fastValidation?: boolean };
  daysToFirstDollar?: number | null; models?: string[]; monetization?: string[]; createdAt?: string;
};
const pretty = (s: unknown) => String(s ?? "").replace(/_/g, " ");

/** Owner change from a screen: same validation and execution as a confirmed ULTRON action. */
async function act(tool: string, input: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== "" && v !== undefined && v !== null));
  const r = await post("os/action", { tool, input: clean });
  return r.status === 200 && r.body.ok ? { ok: true, text: String(r.body.message ?? "Saved.") } : { ok: false, text: String(r.body.error ?? `Could not save (${r.status}).`) };
}

function OppCard({ o, onOpen }: { o: Opp; onOpen: (id: string) => void }) {
  return (
    <button className="os-card os-tap" onClick={() => onOpen(o.id)}>
      <div className="os-row-between">
        <strong>{o.name}</strong>
        <span className="os-score">{o.overall === null ? "unscored" : o.overall.toFixed(1)}</span>
      </div>
      <div className="os-meta">{pretty(o.category)} · {pretty(o.status)} · confidence {pct(o.confidence)} · {o.evidenceCount} evidence / {o.domains} sources{typeof o.daysToFirstDollar === "number" ? ` · ~${o.daysToFirstDollar} days to first $` : ""}</div>
      {o.models && o.models.length ? <div className="os-meta">Fits: {o.models.map(pretty).join(", ")}</div> : null}
      <Chip tier={o.labels.tier} text={o.labels.text} />
    </button>
  );
}

type RadarStep = { category: string; text: string; bad?: boolean };

/** Money Radar: walks the categories one request at a time, stops at the first budget refusal. */
function RadarPanel({ onDone }: { onDone: () => void }) {
  const info = useView("radar", 0);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<RadarStep[]>([]);
  const run = async (cats: { key: string }[], worst: number, searches: number) => {
    if (!window.confirm(`Money Radar searches up to ${searches} times across ${cats.length} categories. Worst case about $${worst.toFixed(2)}, always inside today's AI budget. Run it?`)) return;
    setRunning(true);
    setSteps([]);
    for (const c of cats) {
      const r = await post("os/radar", { category: c.key });
      const b = r.body;
      const label = c.key.replace(/_/g, " ");
      if (r.status === 200 && b.ok) {
        const note = b.cached ? " (reused from cache, $0)" : ` · $${Number(b.spentUsd ?? 0).toFixed(3)}`;
        setSteps((s) => [...s, { category: c.key, text: `${label}: ${b.created} new, ${b.existing} known, ${b.evidenceAdded} evidence${Number(b.evidenceDropped) ? `, ${b.evidenceDropped} unsourced dropped` : ""}${note}` }]);
      } else {
        setSteps((s) => [...s, { category: c.key, text: `${label}: ${String(b.error ?? `HTTP ${r.status}`)}`, bad: true }]);
        if (r.status === 401 || /budget|cap/i.test(String(b.error ?? ""))) break;
      }
    }
    setRunning(false);
    onDone();
  };
  return (
    <div className="os-card">
      <h3 className="os-h3">Money Radar</h3>
      <Shell load={info}>
        {(d) => {
          const cats = list<{ key: string; description: string }>(d.categories) ?? [];
          return (
            <>
              <p className="os-dim">Searches the web in {cats.length} categories for opportunities with real evidence. Every source link is checked against the actual search results.</p>
              <button className="os-btn" disabled={running} onClick={() => void run(cats, Number(d.worstCaseUsd), Number(d.maxSearches))}>{running ? "Running…" : "Run Money Radar"}</button>
            </>
          );
        }}
      </Shell>
      {steps.map((s) => <p key={s.category} className={`os-line${s.bad ? " os-warn" : ""}`}>{s.text}</p>)}
    </div>
  );
}

type Signal = { id: string; title: string; channel: string; url: string; query: string; ageDays: number; views: number; comments: number | null; viewsPerDay: number };
const compact = (n: unknown) => (typeof n === "number" ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : UNAVAILABLE);

/** Social Radar: what people watch on YouTube about making money online (official API counts only). */
function SocialPanel({ onDone }: { onDone: () => void }) {
  const [nonce, setNonce] = useState(0);
  const info = useView("social", nonce);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const run = async (d: Any) => {
    const used = typeof d.unitsToday === "number" ? `${d.unitsToday} of ${d.dailyUnitsCap}` : "unknown";
    if (!window.confirm(`Social Radar runs ${list<string>(d.queries)?.length ?? 0} YouTube searches (${d.plannedUnits} free-quota units; ${used} used today) and one AI call, worst case about $${Number(d.worstCaseUsd).toFixed(3)}. A sweep from the last ${d.cacheHours} hours is reused for free. Run it?`)) return;
    setRunning(true);
    setNote(null);
    const r = await post("os/social", {});
    const b = r.body;
    if (r.status === 200 && b.ok) {
      setNote({ text: `${b.cached ? "Reused today's sweep ($0). " : ""}${b.videos} videos · ${b.created} new opportunities, ${b.existing} known, ${b.evidenceAdded} evidence${Number(b.dropped) ? `, ${b.dropped} unsupported dropped` : ""} · $${Number(b.spentUsd ?? 0).toFixed(3)} · ${b.quotaUnits} quota units` });
    } else {
      setNote({ text: String(b.error ?? `HTTP ${r.status}`), bad: true });
    }
    setRunning(false);
    setNonce((n) => n + 1);
    onDone();
  };
  return (
    <div className="os-card">
      <h3 className="os-h3">Social Radar · YouTube</h3>
      <Shell load={info}>
        {(d) => {
          const latest = (d.latest ?? null) as { at: string | null; signals: Signal[] } | null;
          return (
            <>
              <p className="os-dim">What people watch about making money online in the last {String(d.windowDays)} days, from the official YouTube API. Views and comments are YouTube&apos;s own counts; AI only groups the videos into ideas.</p>
              {!d.keyConfigured ? <p className="os-warn">The YouTube API key is not set in Vercel yet.</p> : (
                <button className="os-btn" disabled={running} onClick={() => void run(d)}>{running ? "Running…" : "Run Social Radar"}</button>
              )}
              {note ? <p className={`os-line${note.bad ? " os-warn" : ""}`}>{note.text}</p> : null}
              {latest === null ? <p className="os-warn">{UNAVAILABLE}</p> : latest.signals.length ? (
                <>
                  <p className="os-meta">Fastest-growing videos · sweep {when(latest.at)}</p>
                  {latest.signals.slice(0, 10).map((x) => {
                    const href = safeHref(x.url);
                    return (
                      <p key={x.id} className="os-line">
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer">{x.title}</a> : x.title}
                        <br /><span className="os-meta">{x.channel} · {compact(x.views)} views in {x.ageDays}d (~{compact(x.viewsPerDay)}/day){x.comments === null ? "" : ` · ${compact(x.comments)} comments`} · “{x.query}”</span>
                      </p>
                    );
                  })}
                </>
              ) : <p className="os-dim">No sweep yet.</p>}
            </>
          );
        }}
      </Shell>
    </div>
  );
}

const SORTS = [["score", "Score"], ["fastest", "Fastest to $"], ["confidence", "Confidence"], ["newest", "Newest"]] as const;
const LABEL_FILTERS = [["", "Any label"], ["high", "HIGH SCORE"], ["strong", "+ STRONG EVIDENCE"], ["fast", "+ FAST VALIDATION"]] as const;

/** Search, filter and sort in the browser over the code-ranked list (no model calls; unknown values sort last). */
function refine(items: Opp[], f: { q: string; category: string; label: string; model: string; sort: string }): Opp[] {
  const q = f.q.trim().toLowerCase();
  let out = items.filter((o) =>
    (!q || `${o.name} ${o.category} ${(o.monetization ?? []).join(" ")}`.toLowerCase().includes(q)) &&
    (!f.category || o.category === f.category) &&
    (!f.model || (o.models ?? []).includes(f.model)) &&
    (!f.label || (f.label === "high" ? o.labels.tier >= 1 : f.label === "strong" ? o.labels.tier >= 2 : o.labels.tier >= 3)));
  const last = (x: number | null | undefined, dir: number) => (typeof x === "number" ? dir * x : Number.POSITIVE_INFINITY);
  if (f.sort === "fastest") out = [...out].sort((a, b) => last(a.daysToFirstDollar, 1) - last(b.daysToFirstDollar, 1) || last(a.overall, -1) - last(b.overall, -1));
  else if (f.sort === "confidence") out = [...out].sort((a, b) => b.confidence - a.confidence);
  else if (f.sort === "newest") out = [...out].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return out;
}

function Opportunities({ nonce, onOpen }: { nonce: number; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState("");
  const [bump, setBump] = useState(0);
  const [f, setF] = useState({ q: "", category: "", label: "", model: "", sort: "score" });
  const load = useView(`opportunities${status ? `?status=${encodeURIComponent(status)}` : ""}`, nonce * 1000 + bump);
  const statuses = ["", "discovered", "researched", "validation_ready", "validating", "validated", "live", "killed"];
  return (
    <>
      <RadarPanel onDone={() => setBump((b) => b + 1)} />
      <SocialPanel onDone={() => setBump((b) => b + 1)} />
      <div className="os-filters" role="group" aria-label="Filter by status">
        {statuses.map((s) => (
          <button key={s || "all"} className={`os-pill${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>{s ? s.replace(/_/g, " ") : "all active"}</button>
        ))}
      </div>
      <Shell load={load}>
        {(d) => {
          const items = list<Opp>(d.items);
          if (!items) return <p className="os-warn">{UNAVAILABLE}</p>;
          if (!items.length) return <p className="os-dim">No opportunities yet. Run Money Radar to find some with evidence.</p>;
          const cats = [...new Set(items.map((o) => o.category))].sort();
          const models = [...new Set(items.flatMap((o) => o.models ?? []))].sort();
          const shown = refine(items, f);
          return (
            <>
              <div className="os-card os-form">
                <input className="os-input wide" type="search" placeholder="Search name, category, money model" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search opportunities" />
                <div className="os-form-row">
                  <select className="os-input" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} aria-label="Sort">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select className="os-input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} aria-label="Label">{LABEL_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select className="os-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</select>
                  <select className="os-input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} aria-label="Money model"><option value="">Any money model</option>{models.map((m) => <option key={m} value={m}>{pretty(m)}</option>)}</select>
                </div>
                <p className="os-dim">{shown.length} of {items.length} shown</p>
              </div>
              {shown.map((o) => <OppCard key={o.id} o={o} onOpen={onOpen} />)}
            </>
          );
        }}
      </Shell>
    </>
  );
}

/** Deep research for one opportunity (owner-triggered, budgeted, cached). */
function ResearchButton({ id, researched, onDone }: { id: string; researched: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const go = async () => {
    const force = researched;
    if (force && !window.confirm("Research again? This runs new searches (about $0.10 to $0.25) instead of reusing the saved result.")) return;
    setBusy(true);
    setMsg(null);
    const r = await post("os/research", { id, force });
    setBusy(false);
    const b = r.body;
    if (r.status === 200 && b.ok) {
      setMsg({ text: b.cached ? "Reused saved research ($0)." : `${b.evidenceAdded} evidence added, ${b.scored} dimensions scored${Number(b.evidenceDropped) ? `, ${b.evidenceDropped} unsourced dropped` : ""} · $${Number(b.spentUsd ?? 0).toFixed(3)}` });
      onDone();
    } else {
      setMsg({ text: String(b.error ?? `HTTP ${r.status}`), bad: true });
    }
  };
  return (
    <>
      <button className="os-btn" disabled={busy} onClick={() => void go()}>{busy ? "Researching… (up to a minute)" : researched ? "Research again" : "Research this"}</button>
      {msg ? <p className={msg.bad ? "os-warn" : "os-dim"} role="status">{msg.text}</p> : null}
    </>
  );
}

type Score = { dimension: string; value: number | null; reason: string | null };
type Ev = { kind: string; claim: string; source_url: string | null; source_domain: string | null; observed_at: string };
const BAD = new Set(["competition", "startup_cost", "tech_difficulty", "acquisition_difficulty"]);

function OpportunityDetail({ id, nonce, onBack }: { id: string; nonce: number; onBack: () => void }) {
  const [bump, setBump] = useState(0);
  const load = useView(`opportunity?id=${encodeURIComponent(id)}`, nonce * 1000 + bump);
  return (
    <>
      <button className="os-link" onClick={onBack}>← All opportunities</button>
      <Shell load={load}>
        {(d) => {
          const o = d.item as Any;
          const L = o.labels as { tier: number; text: string };
          const why = o.why as { strongest: string[]; weakest: string[]; unknown: string[] };
          const scores = (list<Score>(o.scores) ?? []);
          const evidence = list<Ev>(o.evidence) ?? [];
          return (
            <>
              <div className="os-card">
                <h2 className="os-h2">{String(o.name)}</h2>
                <div className="os-meta">{String(o.category)} · {String(o.status).replace(/_/g, " ")}</div>
                <Chip tier={L.tier} text={L.text} />
                <div className="os-stats">
                  <Stat label="Score" value={typeof o.overall === "number" ? (o.overall as number).toFixed(1) : "unscored"} />
                  <Stat label="Confidence" value={pct(o.confidence)} />
                  <Stat label="Validation difficulty" value={o.validationDifficulty === null ? "unknown" : String(o.validationDifficulty)} />
                  <Stat label="Days to first $" value={o.daysToFirstDollar === null ? "unknown" : String(o.daysToFirstDollar)} />
                </div>
                {o.problem ? <p><span className="os-dim">Problem: </span>{String(o.problem)}</p> : null}
                {o.audience ? <p><span className="os-dim">Audience: </span>{String(o.audience)}</p> : null}
                <ResearchButton id={String(o.id)} researched={o.status !== "discovered"} onDone={() => setBump((b) => b + 1)} />
              </div>
              <MonetizationCard m={o.monetizationAnalysis as Any | undefined} />
              {o.status !== "killed" ? (
                <div className="os-card">
                  <h3 className="os-h3">Decide</h3>
                  <NewExperimentForm opportunityId={String(o.id)} defaultName={`Validate: ${String(o.name)}`.slice(0, 160)}
                    defaultHypothesis={String(((o.monetizationAnalysis as Any | undefined)?.cheapestValidation as Any | null)?.description ?? "")} onDone={() => setBump((b) => b + 1)} />
                  <KillButton id={String(o.id)} name={String(o.name)} onDone={() => setBump((b) => b + 1)} />
                </div>
              ) : null}
              <div className="os-card">
                <h3 className="os-h3">Why it scored this way</h3>
                {why.strongest.length ? <ul>{why.strongest.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="os-dim">No strong factors yet.</p>}
                {why.weakest.length ? <><p className="os-dim">Weakest</p><ul>{why.weakest.map((s) => <li key={s}>{s}</li>)}</ul></> : null}
                {why.unknown.length ? <p className="os-dim">Unknown (not scored): {why.unknown.map((u) => u.replace(/_/g, " ")).join(", ")}</p> : null}
              </div>
              <div className="os-card">
                <h3 className="os-h3">Sub-scores</h3>
                {scores.map((s) => (
                  <div key={s.dimension} className="os-bar-row">
                    <span className="os-bar-label">{s.dimension.replace(/_/g, " ")}{BAD.has(s.dimension) ? <span className="os-note"> (lower is better)</span> : null}</span>
                    {s.value === null ? <span className="os-dim">unknown</span> : (
                      <span className="os-bar" aria-label={`${s.value} out of 10`}><span style={{ width: `${s.value * 10}%` }} /></span>
                    )}
                    {s.reason ? <span className="os-bar-reason">{s.reason}</span> : null}
                  </div>
                ))}
              </div>
              <div className="os-card">
                <h3 className="os-h3">Evidence ({evidence.length})</h3>
                {!evidence.length ? <p className="os-dim">No evidence stored yet.</p> : evidence.map((e, i) => {
                  const href = safeHref(e.source_url);
                  return (
                    <p key={i} className="os-ev">
                      <span className="os-tag">{e.kind}</span> {e.claim}{" "}
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{e.source_domain ?? "source"}</a> : null}
                      <span className="os-dim"> · {when(e.observed_at)}</span>
                    </p>
                  );
                })}
              </div>
            </>
          );
        }}
      </Shell>
    </>
  );
}

function Experiments({ nonce }: { nonce: number }) {
  const [bump, setBump] = useState(0);
  const load = useView("experiments", nonce * 1000 + bump);
  return (
    <Shell load={load}>
      {(d) => {
        const items = list<Any>(d.items);
        if (!items) return <p className="os-warn">{UNAVAILABLE}</p>;
        const by = (d.byStatus ?? {}) as Record<string, number>;
        return (
          <>
            <div className="os-stats">
              {["validating", "validated", "live", "killed"].map((s) => <Stat key={s} label={s} value={String(by[s] ?? 0)} />)}
            </div>
            <div className="os-card"><h3 className="os-h3">New experiment</h3><NewExperimentForm onDone={() => setBump((b) => b + 1)} /></div>
            {!items.length ? <p className="os-dim">No experiments yet. Start one here, from an opportunity, or ask ULTRON.</p> : items.map((e) => (
              <div key={String(e.id)} className="os-card">
                <div className="os-row-between"><strong>{String(e.name)}</strong><span className="os-tag">{pretty(e.status)}</span></div>
                {e.hypothesis ? <p>{String(e.hypothesis)}</p> : null}
                <div className="os-meta">Metric: {String(e.success_metric ?? "not set")} · Target: {String(e.target ?? "not set")} · Budget {usd(Number(e.budget_usd))} · started {when(e.started_at)}</div>
                {e.result_note ? <p className="os-dim">{String(e.result_note)}</p> : null}
                <ExperimentStatus id={String(e.id)} current={String(e.status)} onDone={() => setBump((b) => b + 1)} />
              </div>
            ))}
          </>
        );
      }}
    </Shell>
  );
}

function Revenue({ nonce }: { nonce: number }) {
  const [bump, setBump] = useState(0);
  const load = useView("revenue", nonce * 1000 + bump);
  return (
    <Shell load={load}>
      {(d) => {
        const t = d.totals as Any | null;
        const vs = list<Any>(d.ventures);
        const ms = list<Any>(d.months);
        return (
          <>
            <div className="os-stats">
              <Stat label="This month" value={t ? usd(t.thisMonth) : UNAVAILABLE} />
              <Stat label="All-time revenue" value={t ? usd(t.revenue) : UNAVAILABLE} />
              <Stat label="Recorded costs" value={t ? usd(t.cost) : UNAVAILABLE} />
              <Stat label="Profit" value={t ? usd(t.profit) : UNAVAILABLE} />
            </div>
            <RecordRevenueForm onDone={() => setBump((b) => b + 1)} />
            {typeof d.excludedTestPayments === "number" && d.excludedTestPayments > 0 ? (
              <p className="os-dim">{d.excludedTestPayments} Stripe test-mode payment(s) excluded.</p>
            ) : null}
            <div className="os-card">
              <h3 className="os-h3">By venture</h3>
              {!vs ? <p className="os-warn">{UNAVAILABLE}</p> : !vs.length ? <p className="os-dim">No revenue recorded yet. $0 so far.</p> : vs.map((v) => (
                <div key={String(v.venture)} className="os-row-between os-line"><span>{String(v.venture)}</span><span>{usd(v.revenue)} · profit {usd(v.profit)}</span></div>
              ))}
            </div>
            {ms && ms.length ? (
              <div className="os-card">
                <h3 className="os-h3">By month</h3>
                {ms.map((m) => <div key={String(m.month)} className="os-row-between os-line"><span>{String(m.month)}</span><span>{usd(m.revenue)} · profit {usd(m.profit)}</span></div>)}
              </div>
            ) : null}
          </>
        );
      }}
    </Shell>
  );
}

function Cost({ nonce }: { nonce: number }) {
  const load = useView("cost", nonce);
  return (
    <Shell load={load}>
      {(d) => {
        const today = d.today as Any | null;
        const month = d.month as Any | null;
        const budget = d.budget as Any;
        const est = (x: Any | null) => (x && x.estimated ? "includes estimates" : undefined);
        const groups: [string, unknown][] = [["By task", d.byTask], ["Per opportunity", d.perOpportunity], ["Per experiment", d.perExperiment]];
        return (
          <>
            <div className="os-stats">
              <Stat label="Today" value={today ? usd(today.costUsd, 4) : UNAVAILABLE} note={est(today)} />
              <Stat label="This month" value={month ? usd(month.costUsd, 4) : UNAVAILABLE} note={est(month)} />
              <Stat label="Calls this month" value={month ? String(month.calls) : UNAVAILABLE} />
              <Stat label="Tokens this month" value={month ? `${Number(month.inputTokens).toLocaleString()} in / ${Number(month.outputTokens).toLocaleString()} out` : UNAVAILABLE} />
            </div>
            <div className="os-card">
              <h3 className="os-h3">Daily budget</h3>
              {typeof budget?.pct === "number" ? (
                <>
                  <span className="os-bar wide" aria-label={`${budget.pct}% of the daily budget used`}><span style={{ width: `${budget.pct}%` }} /></span>
                  <p className="os-meta">{usd(budget.usedToday, 4)} of {usd(budget.perDayUsd)} used today. Calls stop when it is reached.</p>
                </>
              ) : <p className="os-warn">{UNAVAILABLE}</p>}
            </div>
            {groups.map(([title, g]) => {
              const rows = list<Any>(g);
              return (
                <div key={title} className="os-card">
                  <h3 className="os-h3">{title}</h3>
                  {!rows ? <p className="os-warn">{UNAVAILABLE}</p> : !rows.length ? <p className="os-dim">Nothing this month.</p> : rows.map((r) => (
                    <div key={String(r.key)} className="os-row-between os-line"><span className="os-trunc">{String(r.key)}</span><span>{usd(r.costUsd, 4)} · {String(r.calls)} calls</span></div>
                  ))}
                </div>
              );
            })}
          </>
        );
      }}
    </Shell>
  );
}

function Activity({ nonce }: { nonce: number }) {
  const load = useView("activity", nonce);
  return (
    <Shell load={load}>
      {(d) => {
        const items = list<Any>(d.items);
        if (!items) return <p className="os-warn">{UNAVAILABLE}</p>;
        if (!items.length) return <p className="os-dim">No activity yet.</p>;
        return (
          <div className="os-card">
            {items.map((a, i) => (
              <p key={i} className="os-line"><span className="os-dim">{when(a.at)} · {String(a.actor)}</span><br />{String(a.action).replace(/_/g, " ")}{a.detail ? `: ${String(a.detail)}` : ""}</p>
            ))}
          </div>
        );
      }}
    </Shell>
  );
}

const BUDGET_LABELS: Record<string, string> = { per_day_usd: "Per day", per_turn_usd: "Per ULTRON request", per_research_run_usd: "Per research run" };

/** Edits the owner-adjustable budgets within the limits from config/money_os.yaml (checked again on the server). */
function BudgetEditor({ budgets, defaults, editable, onSaved }: { budgets: Record<string, number>; defaults: Record<string, number>; editable: { name: string; min: number; max: number }[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(editable.map((e) => [e.name, String(budgets[e.name] ?? "")])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const changes = editable
    .map((e) => ({ ...e, value: Number(draft[e.name]) }))
    .filter((e) => draft[e.name] !== "" && Number.isFinite(e.value) && Math.round(e.value * 100) / 100 !== budgets[e.name]);
  const bad = editable.find((e) => { const v = Number(draft[e.name]); return draft[e.name] === "" || !Number.isFinite(v) || v < e.min || v > e.max; });
  const save = async () => {
    if (!changes.length || bad) return;
    const text = changes.map((c) => `${BUDGET_LABELS[c.name] ?? c.name}: ${usd(budgets[c.name])} → ${usd(c.value)}`).join("\n");
    if (!window.confirm(`Change AI budgets?\n\n${text}`)) return;
    setBusy(true); setMsg("");
    const r = await post("os/settings", { budgets: Object.fromEntries(changes.map((c) => [c.name, c.value])) });
    setBusy(false);
    if (r.status === 200 && r.body.ok) { setMsg("Saved."); onSaved(); } else setMsg(String(r.body.error ?? `Could not save (${r.status}).`));
  };
  return (
    <div className="os-card">
      <h3 className="os-h3">AI budgets</h3>
      {editable.map((e) => (
        <label key={e.name} className="os-row-between os-line">
          <span>{BUDGET_LABELS[e.name] ?? e.name}<br /><span className="os-dim">{usd(e.min)}–{usd(e.max)} · default {usd(defaults[e.name])}</span></span>
          <input className="os-input" style={{ width: 96 }} inputMode="decimal" type="number" step="0.01" min={e.min} max={e.max}
            value={draft[e.name] ?? ""} onChange={(ev) => setDraft({ ...draft, [e.name]: ev.target.value })} aria-label={BUDGET_LABELS[e.name] ?? e.name} />
        </label>
      ))}
      <div className="os-row-between os-line"><span>Per experiment</span><span>{usd(budgets.per_experiment_usd)}</span></div>
      {bad ? <p className="os-dim">{BUDGET_LABELS[bad.name]} must be {usd(bad.min)}–{usd(bad.max)}.</p> : null}
      <button className="os-btn" type="button" disabled={busy || !changes.length || Boolean(bad)} onClick={save}>{busy ? "Saving…" : "Save budgets"}</button>
      {msg ? <p className="os-line" role="status">{msg}</p> : null}
    </div>
  );
}

function Settings({ nonce }: { nonce: number }) {
  const [bump, setBump] = useState(0);
  const load = useView("settings", nonce + bump);
  return (
    <Shell load={load}>
      {(d) => {
        const b = d.budgets as Record<string, number>;
        const sc = d.score as Any;
        const L = (sc?.labels ?? {}) as Any;
        const se = (L.strong_evidence ?? {}) as Any;
        const fv = (L.fast_validation ?? {}) as Any;
        const editable = list<{ name: string; min: number; max: number }>(d.editable) ?? [];
        return (
          <>
            {d.canEdit && editable.length
              ? <BudgetEditor key={JSON.stringify(b)} budgets={b} defaults={(d.defaults ?? {}) as Record<string, number>} editable={editable} onSaved={() => setBump((x) => x + 1)} />
              : (
                <div className="os-card">
                  <h3 className="os-h3">AI budgets</h3>
                  <div className="os-row-between os-line"><span>Per day</span><span>{usd(b?.per_day_usd)}</span></div>
                  <div className="os-row-between os-line"><span>Per ULTRON request</span><span>{usd(b?.per_turn_usd)}</span></div>
                  <div className="os-row-between os-line"><span>Per research run</span><span>{usd(b?.per_research_run_usd)}</span></div>
                  <div className="os-row-between os-line"><span>Per experiment</span><span>{usd(b?.per_experiment_usd)}</span></div>
                </div>
              )}
            {d.canEdit ? <StopSwitch paused={d.aiPaused === true} onDone={() => setBump((x) => x + 1)} /> : null}
            <div className="os-card">
              <h3 className="os-h3">Labels</h3>
              <p className="os-line">HIGH SCORE: score ≥ {String(L.high_score_min)}</p>
              <p className="os-line">+ STRONG EVIDENCE: confidence ≥ {pct(se.min_confidence)} and ≥ {String(se.min_domains)} sources</p>
              <p className="os-line">+ FAST VALIDATION: difficulty ≤ {String(fv.max_validation_difficulty)} and ≤ {String(fv.max_days_to_first_dollar)} days to first $</p>
            </div>
            <div className="os-card">
              <h3 className="os-h3">Cache</h3>
              <p className="os-line">Research results reused for {String((d.cache as Any)?.research_ttl_days)} days.</p>
            </div>
            <p className="os-dim">Budget changes apply to the next AI call. Prices, scoring and cache stay in config/money_os.yaml.</p>
          </>
        );
      }}
    </Shell>
  );
}

/** Monetization Analysis: revenue models (proposed by research, validated in code) plus stored sub-scores. */
function MonetizationCard({ m }: { m: Any | undefined }) {
  if (!m) return null;
  const models = list<{ model: string; fit: number; reason: string }>(m.models) ?? [];
  const v = m.cheapestValidation as Any | null;
  const n = (x: unknown, suffix = "/10") => (typeof x === "number" ? `${x}${suffix}` : "unknown");
  return (
    <div className="os-card">
      <h3 className="os-h3">Monetization analysis</h3>
      {!m.analyzed ? <p className="os-dim">Not analyzed yet. Research this opportunity to see which revenue models fit.</p> : models.map((x) => (
        <div key={x.model} className="os-bar-row">
          <span className="os-bar-label">{pretty(x.model)}</span>
          <span className="os-bar" aria-label={`${x.fit} out of 10`}><span style={{ width: `${x.fit * 10}%` }} /></span>
          <span className="os-bar-reason">{x.reason}</span>
        </div>
      ))}
      <div className="os-stats">
        <Stat label="Recurring potential" value={n(m.recurring)} />
        <Stat label="Affiliate potential" value={n(m.affiliate)} />
        <Stat label="Digital product fit" value={n(m.digitalProduct)} />
        <Stat label="SaaS fit" value={n(m.saas)} />
        <Stat label="Days to first $" value={n(m.daysToFirstDollar, "")} />
        <Stat label="Validation difficulty" value={n(m.validationDifficulty)} />
      </div>
      {list<string>(m.withoutSoftware)?.length ? <p className="os-line">Without building software: {(list<string>(m.withoutSoftware) ?? []).map(pretty).join(", ")}</p> : null}
      {v ? <p className="os-line"><span className="os-dim">Cheapest validation: </span>{pretty(v.method)}: {String(v.description)} (~{usd(v.est_cost_usd)}, ~{String(v.est_days)} days)</p> : null}
      <p className="os-dim">Fits and the validation plan are model estimates from the stored evidence; sub-scores come from the scoring above.</p>
    </div>
  );
}

function NewExperimentForm({ opportunityId, defaultName = "", defaultHypothesis = "", onDone }: { opportunityId?: string; defaultName?: string; defaultHypothesis?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: defaultName, hypothesis: defaultHypothesis, success_metric: "", target: "", budget_usd: "0" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="os-btn" onClick={() => setOpen(true)}>Start an experiment</button>;
  const save = async () => {
    const budget = Number(v.budget_usd || 0);
    if (!v.name.trim() || !Number.isFinite(budget) || budget < 0) { setMsg({ ok: false, text: "Name and a budget of $0 or more are required." }); return; }
    if (!window.confirm(`Create experiment "${v.name.trim()}" with budget ${usd(budget)}?`)) return;
    setBusy(true);
    const r = await act("create_experiment", { name: v.name.trim(), opportunity_id: opportunityId, hypothesis: v.hypothesis.trim(), success_metric: v.success_metric.trim(), target: v.target.trim(), budget_usd: budget });
    setBusy(false); setMsg(r);
    if (r.ok) { setOpen(false); onDone(); }
  };
  const field = (k: keyof typeof v, label: string, extra: Record<string, unknown> = {}) => (
    <label className="os-field"><span>{label}</span><input className="os-input wide" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} /></label>
  );
  return (
    <div className="os-form">
      {field("name", "Name", { maxLength: 160 })}
      {field("hypothesis", "Hypothesis", { maxLength: 1000 })}
      {field("success_metric", "Success metric (e.g. purchases)", { maxLength: 300 })}
      {field("target", "Target (e.g. 5 sales in 14 days)", { maxLength: 300 })}
      {field("budget_usd", "Budget $", { inputMode: "decimal", type: "number", min: 0, step: "0.01" })}
      <div className="os-form-row"><button className="os-btn" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Create"}</button><button className="os-btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      {msg ? <p className={msg.ok ? "os-dim" : "os-warn"} role="status">{msg.text}</p> : null}
    </div>
  );
}

const EXP_STATUSES = ["validation_ready", "validating", "validated", "building", "live", "growing", "killed"];

function ExperimentStatus({ id, current, onDone }: { id: string; current: string; onDone: () => void }) {
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (status === current) return;
    if (!window.confirm(`Change status from ${pretty(current)} to ${pretty(status)}?`)) return;
    setBusy(true);
    const r = await act("set_experiment_status", { experiment_id: id, status, result_note: note.trim() });
    setBusy(false); setMsg(r);
    if (r.ok) onDone();
  };
  return (
    <div className="os-form">
      <div className="os-form-row">
        <select className="os-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Experiment status">{EXP_STATUSES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</select>
        <button className="os-btn" disabled={busy || status === current} onClick={() => void save()}>Update</button>
      </div>
      {status !== current ? <input className="os-input wide" placeholder="Result note (what the data showed)" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Result note" /> : null}
      {msg ? <p className={msg.ok ? "os-dim" : "os-warn"} role="status">{msg.text}</p> : null}
    </div>
  );
}

function KillButton({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    const reason = window.prompt(`Why kill "${name}"? (It stays stored, hidden from the ranking.)`)?.trim();
    if (!reason) return;
    const r = await act("kill_opportunity", { opportunity_id: id, reason: reason.slice(0, 500) });
    setMsg(r);
    if (r.ok) onDone();
  };
  return <>
    <button className="os-btn ghost" onClick={() => void go()}>Kill this opportunity</button>
    {msg ? <p className={msg.ok ? "os-dim" : "os-warn"} role="status">{msg.text}</p> : null}
  </>;
}

const REVENUE_SOURCES = ["manual", "affiliate", "marketplace", "other"];
const todayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function RecordRevenueForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ venture: "", amount_usd: "", cost_usd: "0", source: "manual", occurred_on: todayEt(), product: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <div className="os-card"><button className="os-btn" onClick={() => setOpen(true)}>Record revenue</button><p className="os-dim">For money received outside Stripe (affiliate payouts, marketplace sales). Stripe payments are counted automatically.</p></div>;
  const save = async () => {
    const amount = Number(v.amount_usd);
    const cost = Number(v.cost_usd || 0);
    if (!v.venture.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(cost) || cost < 0) { setMsg({ ok: false, text: "Venture and an amount above $0 are required." }); return; }
    if (!window.confirm(`Record ${usd(amount)} for ${v.venture.trim()} on ${v.occurred_on}?`)) return;
    setBusy(true);
    const r = await act("record_revenue", { venture: v.venture.trim(), amount_usd: amount, cost_usd: cost, source: v.source, occurred_on: v.occurred_on, product: v.product.trim(), note: v.note.trim() });
    setBusy(false); setMsg(r);
    if (r.ok) { setOpen(false); onDone(); }
  };
  const field = (k: keyof typeof v, label: string, extra: Record<string, unknown> = {}) => (
    <label className="os-field"><span>{label}</span><input className="os-input wide" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} /></label>
  );
  return (
    <div className="os-card os-form">
      <h3 className="os-h3">Record revenue</h3>
      {field("venture", "Venture", { maxLength: 80 })}
      {field("amount_usd", "Amount received $", { inputMode: "decimal", type: "number", min: 0, step: "0.01" })}
      {field("cost_usd", "Direct cost $", { inputMode: "decimal", type: "number", min: 0, step: "0.01" })}
      <label className="os-field"><span>Source</span><select className="os-input wide" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })}>{REVENUE_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      {field("occurred_on", "Date", { type: "date", max: todayEt() })}
      {field("product", "Product (optional)", { maxLength: 160 })}
      {field("note", "Note (optional)", { maxLength: 500 })}
      <div className="os-form-row"><button className="os-btn" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button><button className="os-btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      {msg ? <p className={msg.ok ? "os-dim" : "os-warn"} role="status">{msg.text}</p> : null}
    </div>
  );
}

/** Emergency stop: refuses every model call (ULTRON, Radar, research) until resumed. */
function StopSwitch({ paused, onDone }: { paused: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const flip = async () => {
    if (!window.confirm(paused ? "Resume AI calls?" : "Stop ALL AI calls now? ULTRON, Radar and research will refuse until you resume.")) return;
    setBusy(true);
    const r = await post("os/settings", { aiPaused: !paused });
    setBusy(false);
    if (r.status === 200 && r.body.ok) { setMsg(r.body.aiPaused ? "AI stopped." : "AI resumed."); onDone(); } else setMsg(String(r.body.error ?? `Could not save (${r.status}).`));
  };
  return (
    <div className={`os-card${paused ? " os-stopped" : ""}`}>
      <h3 className="os-h3">Emergency stop</h3>
      <p className="os-line">{paused ? "AI is STOPPED. No model calls are made." : "AI is running within the budgets above."}</p>
      <button className={`os-btn${paused ? "" : " danger"}`} disabled={busy} onClick={() => void flip()}>{paused ? "Resume AI" : "Stop all AI"}</button>
      {msg ? <p className="os-dim" role="status">{msg}</p> : null}
    </div>
  );
}

function Command({ nonce, go }: { nonce: number; go: (h: string) => void }) {
  const opps = useView("opportunities", nonce);
  const cost = useView("cost", nonce);
  const exps = useView("experiments", nonce);
  const rev = useView("revenue", nonce);
  const next = useView("next", nonce);
  return (
    <>
      <div className="os-card os-next">
        <h3 className="os-h3">Next move</h3>
        <Shell load={next}>
          {(d) => {
            const r = d.recommended as { kind: string; text: string; targetId: string | null } | null;
            const t = d.top_opportunity as Any | null;
            if (!r) return <p className="os-warn">{UNAVAILABLE}</p>;
            const v = t?.cheapestValidation as Any | null;
            return (
              <>
                <p className="os-next-text">{r.text}</p>
                {r.targetId && r.kind !== "decide_experiment" ? <button className="os-btn" onClick={() => go(`opportunity/${r.targetId}`)}>Open</button> : null}
                {r.kind === "decide_experiment" ? <button className="os-btn" onClick={() => go("experiments")}>Open experiments</button> : null}
                {r.kind === "run_radar" ? <button className="os-btn" onClick={() => go("opportunities")}>Go to Money Radar</button> : null}
                {t ? (
                  <div className="os-line">
                    <span className="os-dim">Highest potential: </span><strong>{String(t.name)}</strong> · {typeof t.score === "number" ? (t.score as number).toFixed(1) : "unscored"} · confidence {pct(t.confidence)}
                    {list<Any>(t.models)?.length ? <div className="os-meta">Money: {(list<Any>(t.models) ?? []).map((m) => `${pretty(m.model)} ${String(m.fit)}/10`).join(", ")}</div> : null}
                    {v ? <div className="os-meta">Cheapest test: {pretty(v.method)}, ~{usd(v.est_cost_usd)}, ~{String(v.est_days)} days</div> : null}
                  </div>
                ) : null}
              </>
            );
          }}
        </Shell>
      </div>
      <div className="os-card">
        <h2 className="os-h2">ULTRON</h2>
        <p className="os-dim">Talk or type to the assistant. It answers from the same data and asks before changing anything.</p>
        <a className="os-btn" href="/jarvis">Open ULTRON</a>
      </div>
      <div className="os-stats">
        <Shell load={cost}>{(d) => <Stat label="AI cost today" value={d.today ? usd((d.today as Any).costUsd, 4) : UNAVAILABLE} />}</Shell>
        <Shell load={exps}>{(d) => <Stat label="Active experiments" value={d.byStatus ? String(((d.byStatus as Record<string, number>).validating ?? 0) + ((d.byStatus as Record<string, number>).live ?? 0)) : UNAVAILABLE} />}</Shell>
        <Shell load={rev}>{(d) => <Stat label="Revenue this month" value={d.totals ? usd((d.totals as Any).thisMonth) : UNAVAILABLE} />}</Shell>
      </div>
      <div className="os-card">
        <h3 className="os-h3">Top opportunities</h3>
        <Shell load={opps}>
          {(d) => {
            const items = list<Opp>(d.items);
            if (!items) return <p className="os-warn">{UNAVAILABLE}</p>;
            if (!items.length) return <p className="os-dim">None yet.</p>;
            return items.slice(0, 3).map((o) => <OppCard key={o.id} o={o} onOpen={(id) => go(`opportunity/${id}`)} />);
          }}
        </Shell>
      </div>
    </>
  );
}

async function post(path: string, data: unknown): Promise<{ status: number; body: Any }> {
  const r = await fetch(`/api/jarvis/${path}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Any };
}

/** Owner sign-in on this page (same endpoints and rules as ULTRON): email, then the 6-digit code from the email. */
function SignIn({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await post("auth/start", { email });
    setBusy(false);
    setMsg(String(r.body.message ?? r.body.error ?? ""));
    if (r.status === 200) setStep("code");
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await post("auth/verify", { email, code });
    setBusy(false);
    if (r.status === 200) onDone();
    else setMsg(String(r.body.error ?? "Sign-in failed."));
  };
  return (
    <div className="os-card os-signin">
      <h2 className="os-h2">Sign in</h2>
      <p className="os-dim">Owner access only.</p>
      {step === "email" ? (
        <form onSubmit={send}>
          <label htmlFor="os-email">Email</label>
          <input id="os-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="os-btn" disabled={busy}>Email me a code</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="os-code">6-digit code from the email</label>
          <input id="os-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" required value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="os-btn" disabled={busy}>Sign in</button>
          <button type="button" className="os-link" onClick={() => setStep("email")}>Use a different email</button>
        </form>
      )}
      {msg ? <p role="status">{msg}</p> : null}
      <p className="os-dim">Use the code here. The link in the email opens ULTRON instead.</p>
    </div>
  );
}

export default function MoneyOs() {
  const [auth, setAuth] = useState<"checking" | "signin" | "ready" | "error">("checking");
  const [authTry, setAuthTry] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/jarvis/me", { credentials: "same-origin", cache: "no-store" })
      .then((r) => { if (live) setAuth(r.status === 200 ? "ready" : r.status === 401 || r.status === 403 ? "signin" : "error"); })
      .catch(() => { if (live) setAuth("error"); });
    return () => { live = false; };
  }, [authTry]);
  if (auth !== "ready") {
    return (
      <div className="os">
        <div className="os-shell">
          <header className="os-head"><span className="os-title">MONEY OS</span></header>
          {auth === "checking" ? <p className="os-dim">Loading…</p>
            : auth === "signin" ? <SignIn onDone={() => setAuthTry((n) => n + 1)} />
            : <p className="os-warn">{UNAVAILABLE} (sign-in service unreachable)</p>}
        </div>
      </div>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const [hash, setHash] = useState("command");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, "") || "command");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = useCallback((h: string) => { window.location.hash = h; }, []);
  const detail = /^opportunity\/([0-9a-f-]{36})$/i.exec(hash)?.[1] ?? null;
  const tab: Tab = detail ? "opportunities" : isTab(hash) ? hash : "command";
  useEffect(() => {
    document.querySelector(".os-tab.on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  return (
    <div className="os">
      <div className="os-shell">
        <header className="os-head">
          <span className="os-title">MONEY OS</span>
          <button className="os-link" onClick={() => setNonce((n) => n + 1)}>Refresh</button>
        </header>
        <nav className="os-tabs" aria-label="Sections">
          {TABS.map(([k, label]) => (
            <a key={k} href={`#${k}`} className={`os-tab${tab === k ? " on" : ""}`} aria-current={tab === k ? "page" : undefined}>{label}</a>
          ))}
        </nav>
        <main className="os-main">
          {detail ? <OpportunityDetail id={detail} nonce={nonce} onBack={() => go("opportunities")} />
            : tab === "command" ? <Command nonce={nonce} go={go} />
            : tab === "opportunities" ? <Opportunities nonce={nonce} onOpen={(id) => go(`opportunity/${id}`)} />
            : tab === "experiments" ? <Experiments nonce={nonce} />
            : tab === "revenue" ? <Revenue nonce={nonce} />
            : tab === "cost" ? <Cost nonce={nonce} />
            : tab === "activity" ? <Activity nonce={nonce} />
            : <Settings nonce={nonce} />}
        </main>
      </div>
    </div>
  );
}
