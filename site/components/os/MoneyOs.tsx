"use client";
// Money OS (Phase 1): read-only screens for opportunities, experiments, revenue, AI cost, activity and settings.
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
        <p>Sign in through ULTRON first. Money OS uses the same owner sign-in.</p>
        <a className="os-btn" href="/jarvis">Open ULTRON to sign in</a>
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

type Opp = { id: string; name: string; category: string; status: string; overall: number | null; confidence: number; evidenceCount: number; domains: number; labels: { tier: number; text: string } };

function OppCard({ o, onOpen }: { o: Opp; onOpen: (id: string) => void }) {
  return (
    <button className="os-card os-tap" onClick={() => onOpen(o.id)}>
      <div className="os-row-between">
        <strong>{o.name}</strong>
        <span className="os-score">{o.overall === null ? "unscored" : o.overall.toFixed(1)}</span>
      </div>
      <div className="os-meta">{o.category} · {o.status.replace(/_/g, " ")} · confidence {pct(o.confidence)} · {o.evidenceCount} evidence / {o.domains} sources</div>
      <Chip tier={o.labels.tier} text={o.labels.text} />
    </button>
  );
}

function Opportunities({ nonce, onOpen }: { nonce: number; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState("");
  const load = useView(`opportunities${status ? `?status=${encodeURIComponent(status)}` : ""}`, nonce);
  const statuses = ["", "discovered", "researched", "validation_ready", "validating", "validated", "live", "killed"];
  return (
    <>
      <div className="os-filters" role="group" aria-label="Filter by status">
        {statuses.map((s) => (
          <button key={s || "all"} className={`os-pill${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>{s ? s.replace(/_/g, " ") : "all active"}</button>
        ))}
      </div>
      <Shell load={load}>
        {(d) => {
          const items = list<Opp>(d.items);
          if (!items) return <p className="os-warn">{UNAVAILABLE}</p>;
          if (!items.length) return <p className="os-dim">No opportunities yet. Money Radar (next build slice) will add them with evidence.</p>;
          return items.map((o) => <OppCard key={o.id} o={o} onOpen={onOpen} />);
        }}
      </Shell>
    </>
  );
}

type Score = { dimension: string; value: number | null; reason: string | null };
type Ev = { kind: string; claim: string; source_url: string | null; source_domain: string | null; observed_at: string };
const BAD = new Set(["competition", "startup_cost", "tech_difficulty", "acquisition_difficulty"]);

function OpportunityDetail({ id, nonce, onBack }: { id: string; nonce: number; onBack: () => void }) {
  const load = useView(`opportunity?id=${encodeURIComponent(id)}`, nonce);
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
              </div>
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
  const load = useView("experiments", nonce);
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
            {!items.length ? <p className="os-dim">No experiments yet. Create one from an opportunity (ULTRON, later build slice).</p> : items.map((e) => (
              <div key={String(e.id)} className="os-card">
                <div className="os-row-between"><strong>{String(e.name)}</strong><span className="os-tag">{String(e.status)}</span></div>
                {e.hypothesis ? <p>{String(e.hypothesis)}</p> : null}
                <div className="os-meta">Metric: {String(e.success_metric ?? "not set")} · Target: {String(e.target ?? "not set")} · Budget {usd(Number(e.budget_usd))}</div>
                {e.result_note ? <p className="os-dim">{String(e.result_note)}</p> : null}
              </div>
            ))}
          </>
        );
      }}
    </Shell>
  );
}

function Revenue({ nonce }: { nonce: number }) {
  const load = useView("revenue", nonce);
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

function Settings({ nonce }: { nonce: number }) {
  const load = useView("settings", nonce);
  return (
    <Shell load={load}>
      {(d) => {
        const b = d.budgets as Record<string, number>;
        const sc = d.score as Any;
        const L = (sc?.labels ?? {}) as Any;
        const se = (L.strong_evidence ?? {}) as Any;
        const fv = (L.fast_validation ?? {}) as Any;
        return (
          <>
            <div className="os-card">
              <h3 className="os-h3">AI budgets</h3>
              <div className="os-row-between os-line"><span>Per day</span><span>{usd(b?.per_day_usd)}</span></div>
              <div className="os-row-between os-line"><span>Per ULTRON request</span><span>{usd(b?.per_turn_usd)}</span></div>
              <div className="os-row-between os-line"><span>Per research run</span><span>{usd(b?.per_research_run_usd)}</span></div>
              <div className="os-row-between os-line"><span>Per experiment</span><span>{usd(b?.per_experiment_usd)}</span></div>
            </div>
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
            <p className="os-dim">Read-only for now. Values live in config/money_os.yaml; editing from the phone comes in a later build slice.</p>
          </>
        );
      }}
    </Shell>
  );
}

function Command({ nonce, go }: { nonce: number; go: (h: string) => void }) {
  const opps = useView("opportunities", nonce);
  const cost = useView("cost", nonce);
  const exps = useView("experiments", nonce);
  return (
    <>
      <div className="os-card">
        <h2 className="os-h2">ULTRON</h2>
        <p className="os-dim">Talk or type to the assistant. It answers from the same data and asks before changing anything.</p>
        <a className="os-btn" href="/jarvis">Open ULTRON</a>
      </div>
      <div className="os-stats">
        <Shell load={cost}>{(d) => <Stat label="AI cost today" value={d.today ? usd((d.today as Any).costUsd, 4) : UNAVAILABLE} />}</Shell>
        <Shell load={exps}>{(d) => <Stat label="Active experiments" value={d.byStatus ? String(((d.byStatus as Record<string, number>).validating ?? 0) + ((d.byStatus as Record<string, number>).live ?? 0)) : UNAVAILABLE} />}</Shell>
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

export default function MoneyOs() {
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
