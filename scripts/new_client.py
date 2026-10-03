"""Create clients/<slug>.yaml from an intake answers file, validate it, and upsert the `clients` row.

  uv run python scripts/new_client.py ops/intake_template.yaml --dry-run     # print the YAML + checklist only
  uv run python scripts/new_client.py data/intake/acme-plumbing.yaml               # write YAML, upsert clients row
  uv run python scripts/new_client.py data/intake/acme-plumbing.yaml --skip-db     # write YAML only

Owner phone, owner email and handoff number are written to the YAML as ${<SLUG>_OWNER_PHONE} style placeholders
so no client PII lives in git; the real values go to the Supabase row and (by you) into the Pipecat secret set.
The script prints the exact secret names. DB upsert needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))

from agents.client_config import CLIENTS_DIR, ConfigError, load, parse  # noqa: E402
from agents.notify import client_row  # noqa: E402
from agents.notify.http import urllib_http  # noqa: E402
from agents.notify.supabase_rest import Supabase  # noqa: E402
from lp.text import norm_email, norm_phone, redact  # noqa: E402

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
_CONTACTS = (("owner_phone", norm_phone, "OWNER_PHONE"), ("owner_email", norm_email, "OWNER_EMAIL"),
             ("handoff_number", norm_phone, "HANDOFF_NUMBER"))
_DEFAULT_KEYWORDS = ["emergency"]


def slugify(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")[:63]


def build(answers: dict, *, defaults: dict) -> tuple[dict, dict[str, str]]:
    """Returns (client YAML dict, {SECRET_NAME: real value}). Intake keys match the client YAML keys."""
    a = dict(answers)
    slug = a.get("slug") or slugify(a.get("business_name") or "")
    if not _SLUG_RE.match(slug):
        raise ConfigError(slug or "?", ["could not derive a valid slug; set `slug` in the intake file"])
    prefix = slug.upper().replace("-", "_")
    data: dict = {"slug": slug}
    for k in ("business_name", "industry", "timezone", "hours", "services", "service_area", "faqs"):
        if k in a:
            data[k] = a[k]
    data["booking_method"] = a.get("booking_method") or {"type": a.get("booking_type", "take_message")}
    secrets: dict[str, str] = {}
    for key, norm, suffix in _CONTACTS:
        raw = a.get(key)
        if raw in (None, ""):
            continue
        if norm(str(raw)) is None:
            raise ConfigError(slug, [f"{key} is not valid: {raw!r}"])
        name = f"{prefix}_{suffix}"
        data[key], secrets[name] = "${" + name + "}", norm(str(raw))
    if a.get("twilio_number"):  # a business line is public; kept literal so routing works from the YAML alone
        if norm_phone(str(a["twilio_number"])) is None:
            raise ConfigError(slug, [f"twilio_number is not valid: {a['twilio_number']!r}"])
        data["twilio_number"] = norm_phone(str(a["twilio_number"]))
    data["emergency_keywords"] = a.get("emergency_keywords") or _DEFAULT_KEYWORDS
    data["tts"] = a.get("tts") or defaults["tts"]
    data["languages"] = a.get("languages") or ["en"]
    if a.get("greeting_es"):
        data["greeting_es"] = a["greeting_es"]
    data["greeting"] = a.get("greeting") or defaults["greeting"]
    data["max_call_minutes"] = a.get("max_call_minutes", defaults["max_call_minutes"])
    data["silence_timeout_secs"] = a.get("silence_timeout_secs", defaults["silence_timeout_secs"])
    return data, secrets


def demo_defaults(clients_dir: Path) -> dict:
    d = yaml.safe_load((clients_dir / "demo.yaml").read_text())
    return {k: d[k] for k in ("tts", "greeting", "max_call_minutes", "silence_timeout_secs")}


def run(intake: Path, *, clients_dir: Path = CLIENTS_DIR, dry_run: bool = False, skip_db: bool = False,
        force: bool = False, status: str | None = None, env=None, http=urllib_http, out=print) -> int:
    answers = yaml.safe_load(intake.read_text())
    if not isinstance(answers, dict):
        out("intake file must be a YAML mapping")
        return 2
    try:
        data, secrets = build(answers, defaults=demo_defaults(clients_dir))
        slug = data["slug"]
        cfg = parse(data, slug)  # placeholders stay unresolved; every other rule is enforced
    except ConfigError as e:
        out(f"INVALID: {e}")
        return 2
    text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100)
    path = clients_dir / f"{slug}.yaml"
    if dry_run:
        out(text)
    else:
        if path.exists() and not force:
            out(f"{path} already exists; pass --force to overwrite")
            return 2
        path.write_text(text)
        load(slug, clients_dir=clients_dir)  # re-validate exactly as the bot will load it
        out(f"wrote {path}")

    if not skip_db and not dry_run:
        import os
        db = Supabase(os.environ if env is None else env, http)
        if not db.configured:
            out("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: YAML written, clients row NOT upserted (rerun without --skip-db)")
            return 3
        row = client_row(cfg, status=status)
        # DB row holds the real contact values (service-role only); the YAML snapshot keeps placeholders.
        for key, _, suffix in _CONTACTS:
            if key in data:
                row[key] = secrets[f"{slug.upper().replace('-', '_')}_{suffix}"]
        try:
            db.upsert_client(row, overwrite=True)
        except Exception as e:
            out(redact(f"clients upsert FAILED: {e}"))
            return 3
        out(f"clients row upserted for {slug}")

    out("\nNext: add these names to the Pipecat secret set lp-receptionist-secrets (values from the intake file):")
    for name in secrets:
        out(f"  {name}")
    out("Then commit clients/%s.yaml, redeploy the agent, and follow ops/onboarding.md." % slug)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("intake", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="validate and print the YAML; write nothing")
    ap.add_argument("--skip-db", action="store_true", help="write the YAML but do not touch Supabase")
    ap.add_argument("--force", action="store_true", help="overwrite an existing clients/<slug>.yaml")
    ap.add_argument("--status", choices=("onboarding", "live", "paused", "ended"),
                    help="set clients.status (default: leave an existing row's status alone; new rows start as onboarding)")
    args = ap.parse_args(argv)
    return run(args.intake, dry_run=args.dry_run, skip_db=args.skip_db, force=args.force, status=args.status)


if __name__ == "__main__":
    sys.exit(main())
