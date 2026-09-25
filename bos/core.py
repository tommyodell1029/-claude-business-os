"""Core: config, SQLite schema/migrations, audit log, secret redaction, approval gate, task queue."""
from __future__ import annotations

import json
import os
import re
import sqlite3
import tomllib
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ------------------------------------------------------------------ time / json

def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ts(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s)


def jd(x) -> str:
    return json.dumps(x, default=str)


def jl(s, default=None):
    if s in (None, ""):
        return default
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return default

# ------------------------------------------------------------------ config

_CFG: dict | None = None


def config(reload: bool = False) -> dict:
    global _CFG
    if _CFG is None or reload:
        path = Path(os.environ.get("BOS_CONFIG", ROOT / "config.toml"))
        with open(path, "rb") as f:
            _CFG = tomllib.load(f)
    return _CFG


def validate_config(cfg: dict) -> list[str]:
    """Return list of config problems (empty = OK)."""
    errs = []
    for code, s in cfg.get("services", {}).items():
        p, h = s.get("prices", []), s.get("hours", [])
        if len(p) != 3 or len(h) != 3:
            errs.append(f"services.{code}: prices/hours need 3 tiers")
        elif sorted(p) != p:
            errs.append(f"services.{code}: prices must ascend")
        if not s.get("keywords"):
            errs.append(f"services.{code}: no keywords")
    w = cfg.get("scoring", {}).get("weights", {})
    if sum(w.values()) != 100:
        errs.append(f"scoring.weights sum to {sum(w.values())}, expected 100")
    for mp, m in cfg.get("marketplaces", {}).items():
        if m.get("auto_submit") and m.get("integration") != "mcp":
            errs.append(f"marketplaces.{mp}: auto_submit requires an official integration")
    o = cfg.get("outreach", {})
    if len(o.get("sequence", [])) != len(o.get("delays_days", [])):
        errs.append("outreach: sequence and delays_days length differ")
    return errs

# ------------------------------------------------------------------ secrets

_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"xox[bpas]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"(?i)(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*['\"]?[^\s'\"]{6,}"),
]
_SECRET_ENV = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)", re.I)


def redact(text) -> str:
    if text is None:
        return text
    s = str(text)
    for k, v in os.environ.items():
        if _SECRET_ENV.search(k) and v and len(v) >= 6:
            s = s.replace(v, "[REDACTED]")
    for p in _SECRET_PATTERNS:
        s = p.sub("[REDACTED]", s)
    return s


def secret(name: str) -> str | None:
    """Only sanctioned way to read a credential: environment variables."""
    return os.environ.get(name) or None

# ------------------------------------------------------------------ database

SCHEMA = [
    # v1
    """
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE services (
      code TEXT PRIMARY KEY, name TEXT, prices TEXT, hours TEXT, keywords TEXT, updated_at TEXT);
    CREATE TABLE marketplace_opportunities (
      id INTEGER PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT, url TEXT UNIQUE,
      client TEXT, client_info TEXT, title TEXT NOT NULL, description TEXT, budget_min REAL,
      budget_max REAL, budget_type TEXT DEFAULT 'fixed', skills TEXT, requirements TEXT,
      match_score REAL, score_breakdown TEXT, recommended_service TEXT, recommended_tier TEXT,
      recommended_price REAL, est_hours REAL, est_platform_cost REAL, est_fulfillment_cost REAL,
      est_profit REAL, connects INTEGER, questions TEXT, portfolio_rec TEXT,
      status TEXT NOT NULL DEFAULT 'DISCOVERED', discovered_at TEXT, submitted_at TEXT,
      response TEXT, result TEXT, updated_at TEXT);
    CREATE TABLE leads (
      id INTEGER PRIMARY KEY, business TEXT NOT NULL, niche TEXT, location TEXT, website TEXT,
      email TEXT, phone TEXT, contact_name TEXT, contact_role TEXT, source TEXT NOT NULL,
      source_url TEXT, signals TEXT, problem TEXT, opportunity TEXT, recommended_service TEXT,
      est_value REAL, score REAL, notes TEXT, status TEXT NOT NULL DEFAULT 'NEW',
      suppressed INTEGER NOT NULL DEFAULT 0, suppress_reason TEXT, dedupe_key TEXT UNIQUE,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE outreach (
      id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), channel TEXT, step TEXT,
      subject TEXT, body TEXT, status TEXT NOT NULL DEFAULT 'DRAFT', due_at TEXT, sent_at TEXT,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE proposals (
      id INTEGER PRIMARY KEY, opportunity_id INTEGER REFERENCES marketplace_opportunities(id),
      body TEXT, price REAL, timeline_days INTEGER, questions TEXT, portfolio TEXT,
      lint TEXT, status TEXT NOT NULL DEFAULT 'DRAFT', created_at TEXT, updated_at TEXT);
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, company TEXT, platform TEXT, contact TEXT,
      notes TEXT, created_at TEXT);
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY, client_id INTEGER REFERENCES clients(id),
      opportunity_id INTEGER, service TEXT, tier TEXT, price REAL, scope TEXT, requirements TEXT,
      deadline TEXT, assets TEXT, access_status TEXT DEFAULT 'PENDING', communication TEXT,
      deliverables TEXT, revisions INTEGER DEFAULT 0, payment_status TEXT DEFAULT 'UNPAID',
      fulfillment_status TEXT DEFAULT 'INTAKE', playbook_step INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY, type TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'QUEUED', created TEXT, updated TEXT, source TEXT,
      description TEXT, input TEXT, output TEXT, error TEXT, retry_count INTEGER DEFAULT 0,
      run_after TEXT);
    CREATE INDEX tasks_q ON tasks(status, priority, id);
    CREATE TABLE templates (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT UNIQUE NOT NULL, body TEXT NOT NULL,
      tags TEXT, uses INTEGER DEFAULT 0, updated_at TEXT);
    CREATE TABLE portfolio (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('DEMO','CASE_STUDY','PAID_CLIENT_WORK')),
      service TEXT, problem TEXT, solution TEXT, workflow TEXT, technologies TEXT,
      demo_behavior TEXT, assets TEXT, url TEXT, created_at TEXT);
    CREATE TABLE financial_transactions (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL,
      service TEXT, project_id INTEGER, platform TEXT, memo TEXT, created_at TEXT);
    CREATE TABLE recurring_revenue (
      id INTEGER PRIMARY KEY, client_id INTEGER, project_id INTEGER, service TEXT,
      description TEXT, monthly_amount REAL NOT NULL, status TEXT DEFAULT 'PROPOSED',
      started_at TEXT, ended_at TEXT);
    CREATE TABLE metrics (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, platform TEXT NOT NULL, metric TEXT NOT NULL,
      value REAL NOT NULL, UNIQUE(date, platform, metric));
    CREATE TABLE automation_runs (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, engine TEXT NOT NULL DEFAULT 'local',
      status TEXT, started_at TEXT, finished_at TEXT, error TEXT, cost REAL DEFAULT 0);
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY, ts TEXT, actor TEXT, action TEXT, entity TEXT, entity_id INTEGER,
      detail TEXT);
    """,
]


def db_path() -> str:
    p = os.environ.get("BOS_DB") or str(ROOT / config()["paths"]["db"])
    if p != ":memory:":
        Path(p).parent.mkdir(parents=True, exist_ok=True)
    return p


def connect(path: str | None = None) -> sqlite3.Connection:
    p = path or db_path()
    new = p != ":memory:" and not Path(p).exists()
    con = sqlite3.connect(p, timeout=10)
    if new:
        os.chmod(p, 0o600)  # business data: owner-only
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA journal_mode=WAL") if (path or db_path()) != ":memory:" else None
    migrate(con)
    return con


def migrate(con: sqlite3.Connection) -> int:
    ver = con.execute("PRAGMA user_version").fetchone()[0]
    for i, sql in enumerate(SCHEMA[ver:], start=ver + 1):
        with con:
            con.executescript(sql)
            con.execute(f"PRAGMA user_version={i}")
    if ver < len(SCHEMA):
        seed(con)
    return len(SCHEMA)


def seed(con: sqlite3.Connection) -> None:
    cfg = config()
    with con:
        for code, s in cfg["services"].items():
            con.execute(
                "INSERT OR REPLACE INTO services VALUES (?,?,?,?,?,?)",
                (code, s["name"], jd(s["prices"]), jd(s["hours"]), jd(s["keywords"]), now()))
    tpl = ROOT / "templates.toml"
    if tpl.exists():
        with open(tpl, "rb") as f:
            data = tomllib.load(f)
        with con:
            for name, t in data.items():
                con.execute(
                    "INSERT OR IGNORE INTO templates(kind,name,body,tags,updated_at) VALUES (?,?,?,?,?)",
                    (t["kind"], name, t["body"], jd(t.get("tags", [])), now()))


def log(con, action: str, entity: str = "", entity_id=None, detail="", actor: str = "system") -> None:
    with con:
        con.execute(
            "INSERT INTO audit_logs(ts,actor,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (now(), actor, action, entity, entity_id, redact(detail if isinstance(detail, str) else jd(detail))))

# ------------------------------------------------------------------ approval gate

class ApprovalRequired(Exception):
    def __init__(self, task_id: int, action: str):
        super().__init__(f"approval required for {action} (task #{task_id})")
        self.task_id, self.action = task_id, action


def needs_approval(action: str) -> bool:
    return action in set(config()["approval"]["required"])


_MATCH = ("json_extract(input,'$.action')=? AND json_extract(input,'$.entity')=? "
          "AND json_extract(input,'$.entity_id') IS ?")


def request_approval(con, action: str, entity: str, entity_id, summary: str, payload=None) -> int:
    """Create (or reuse) a REVIEW_REQUIRED approval task. Returns task id."""
    row = con.execute(
        f"SELECT id FROM tasks WHERE type='approval' AND status='REVIEW_REQUIRED' AND {_MATCH}",
        (action, entity, entity_id)).fetchone()
    if row:
        return row["id"]
    inp = {"action": action, "entity": entity, "entity_id": entity_id, "payload": payload}
    tid = enqueue(con, "approval", inp, priority=2, source="gate", description=summary,
                  status="REVIEW_REQUIRED")
    log(con, "approval_requested", entity, entity_id, {"action": action, "task": tid})
    return tid


def gate(con, action: str, entity: str, entity_id, summary: str, payload=None) -> None:
    """Raise ApprovalRequired unless an approved approval task exists for this exact action/entity."""
    if not needs_approval(action):
        return
    ok = con.execute(
        f"SELECT id FROM tasks WHERE type='approval' AND status='COMPLETED' "
        f"AND json_extract(output,'$.approved')=1 AND {_MATCH}", (action, entity, entity_id)).fetchone()
    if ok:
        return
    raise ApprovalRequired(request_approval(con, action, entity, entity_id, summary, payload), action)


def decide(con, task_id: int, approved: bool, note: str = "", actor: str = "user") -> dict:
    t = con.execute("SELECT * FROM tasks WHERE id=? AND type='approval'", (task_id,)).fetchone()
    if not t:
        raise ValueError(f"no approval task #{task_id}")
    if t["status"] != "REVIEW_REQUIRED":
        raise ValueError(f"task #{task_id} is {t['status']}, not awaiting review")
    out = {"approved": approved, "note": note, "by": actor}
    with con:
        con.execute("UPDATE tasks SET status=?, output=?, updated=? WHERE id=?",
                    ("COMPLETED" if approved else "CANCELLED", jd(out), now(), task_id))
    inp = jl(t["input"], {})
    log(con, "approved" if approved else "rejected", inp.get("entity"), inp.get("entity_id"),
        {"action": inp.get("action"), "task": task_id, "note": note}, actor=actor)
    return inp

# ------------------------------------------------------------------ task queue

TASK_STATUSES = ("QUEUED", "RUNNING", "WAITING", "REVIEW_REQUIRED", "COMPLETED", "FAILED", "CANCELLED")
HANDLERS: dict = {}


def handler(name: str):
    def deco(fn):
        HANDLERS[name] = fn
        return fn
    return deco


def enqueue(con, type_: str, inp=None, priority: int = 5, source: str = "cli",
            description: str = "", status: str = "QUEUED", run_after: str | None = None) -> int:
    assert status in TASK_STATUSES
    with con:
        cur = con.execute(
            "INSERT INTO tasks(type,priority,status,created,updated,source,description,input,run_after) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (type_, priority, status, now(), now(), source, description, jd(inp), run_after))
    return cur.lastrowid


def claim(con):
    """Atomically take the highest-priority runnable task (lower number = higher priority)."""
    with con:
        row = con.execute(
            "SELECT * FROM tasks WHERE status='QUEUED' AND (run_after IS NULL OR run_after<=?) "
            "ORDER BY priority, id LIMIT 1", (now(),)).fetchone()
        if not row:
            return None
        n = con.execute("UPDATE tasks SET status='RUNNING', updated=? WHERE id=? AND status='QUEUED'",
                        (now(), row["id"])).rowcount
    return row if n else None


def _finish(con, tid, status, output=None, error=None, retry=None, run_after=None):
    with con:
        con.execute(
            "UPDATE tasks SET status=?, output=COALESCE(?,output), error=?, updated=?, "
            "retry_count=COALESCE(?,retry_count), run_after=? WHERE id=?",
            (status, jd(output) if output is not None else None, redact(error), now(), retry, run_after, tid))


def run_task(con, row) -> str:
    cfg = config()["tasks"]
    fn = HANDLERS.get(row["type"])
    tid = row["id"]
    if not fn:
        _finish(con, tid, "REVIEW_REQUIRED", error=f"no handler for task type '{row['type']}'")
        return "REVIEW_REQUIRED"
    run_id = None
    with con:
        run_id = con.execute("INSERT INTO automation_runs(name,engine,status,started_at) VALUES (?,?,?,?)",
                             (f"task:{row['type']}", "local", "RUNNING", now())).lastrowid
    try:
        # Handlers get their own connection so a timeout can't corrupt ours.
        dbp = con.execute("PRAGMA database_list").fetchone()["file"] or ":memory:"
        if dbp == ":memory:":
            out = fn(con, jl(row["input"], {}))
        else:
            def _call():
                c2 = connect(dbp)
                try:
                    return fn(c2, jl(row["input"], {}))
                finally:
                    c2.close()
            ex = ThreadPoolExecutor(1)
            try:
                out = ex.submit(_call).result(timeout=cfg["timeout_seconds"])
            finally:
                ex.shutdown(wait=False)  # don't block on a hung handler
        if isinstance(out, dict) and out.get("_review"):
            _finish(con, tid, "REVIEW_REQUIRED", output=out)
            status = "REVIEW_REQUIRED"
        else:
            _finish(con, tid, "COMPLETED", output=out)
            status = "COMPLETED"
        err = None
    except ApprovalRequired as e:
        _finish(con, tid, "WAITING", output={"approval_task": e.task_id})
        status, err = "WAITING", str(e)
    except (Exception, FutTimeout) as e:  # noqa: BLE001 — capture everything, never silently fail
        err = "timeout" if isinstance(e, FutTimeout) else f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=3)}"
        n = row["retry_count"] + 1
        if n <= cfg["max_retries"]:
            back = cfg["backoff_seconds"][min(n - 1, len(cfg["backoff_seconds"]) - 1)]
            _finish(con, tid, "QUEUED", error=err, retry=n,
                    run_after=ts(datetime.now(timezone.utc) + timedelta(seconds=back)))
            status = "QUEUED"
        else:
            _finish(con, tid, "FAILED", error=err, retry=n)
            request_approval(con, "irreversible", "task", tid,
                             f"Task #{tid} ({row['type']}) failed {n}x — needs human review", {"error": redact(err)[:500]})
            status = "FAILED"
    with con:
        con.execute("UPDATE automation_runs SET status=?, finished_at=?, error=? WHERE id=?",
                    (status, now(), redact(err), run_id))
    return status


def work(con, limit: int = 50) -> dict:
    """Process runnable tasks by priority. Returns count by resulting status."""
    recover_stale(con)
    res: dict = {}
    for _ in range(limit):
        row = claim(con)
        if not row:
            break
        s = run_task(con, row)
        res[s] = res.get(s, 0) + 1
    return res


def recover_stale(con) -> int:
    cut = ts(datetime.now(timezone.utc) - timedelta(minutes=config()["tasks"]["stale_minutes"]))
    with con:
        n = con.execute("UPDATE tasks SET status='QUEUED', error='recovered from stale RUNNING', "
                        "retry_count=retry_count+1, updated=? WHERE status='RUNNING' AND updated<?",
                        (now(), cut)).rowcount
    if n:
        log(con, "stale_recovered", "tasks", None, {"count": n})
    return n
