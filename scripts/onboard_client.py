"""Turn a submitted client intake into a live-ready client. Dry run by default; nothing changes without --apply.

  uv run python scripts/onboard_client.py acme-plumbing                  # preview the YAML + checklist
  uv run python scripts/onboard_client.py acme-plumbing --apply          # write clients/<slug>.yaml, upsert the clients row
  uv run python scripts/onboard_client.py acme-plumbing --buy-number     # dry run: search a local number, show price, buy nothing
  uv run python scripts/onboard_client.py acme-plumbing --go-live        # after the test call passes
  uv run python scripts/onboard_client.py acme-plumbing --apply --buy-number
        # search Twilio for a number in the client's area code, show number + monthly price, buy ONLY after you type y

Pulls the submitted answers from Supabase `client_intakes` (service key), writes owner phone/email/handoff as
${<SLUG>_OWNER_*} placeholders via scripts/new_client.py (real values go only to the Supabase row), validates with
agents.client_config, prints the Pipecat secret NAMES to add and the Twilio steps. Needs SUPABASE_URL +
SUPABASE_SERVICE_ROLE_KEY (and TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN for --buy-number).
The purchased number gets the same inbound route as the demo: LP_INBOUND_TWIML_URL, else the voice URL of DEMO_TWILIO_NUMBER
(must be a TwiML Bin URL). If neither resolves, the webhook is left unset and the manual step is printed.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlencode

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ROOT / "scripts"))

import new_client  # noqa: E402
from agents.client_config import CLIENTS_DIR  # noqa: E402
from agents.notify.http import call, urllib_http  # noqa: E402
from agents.notify.supabase_rest import Supabase  # noqa: E402
from lp.text import norm_phone, redact  # noqa: E402

DEFAULT_TIMEZONE = "America/New_York"  # Jacksonville; pass --timezone for a client elsewhere
TWIML_BIN_PREFIX = "https://handler.twilio.com/twiml/"
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
# Intake answers that map straight onto the client YAML keys new_client.build understands.
_COPY = ("business_name", "industry", "hours", "services", "service_area", "faqs", "owner_phone", "owner_email",
         "handoff_number", "emergency_keywords", "greeting", "languages", "greeting_es", "address", "never_say")


def intake_to_answers(slug: str, intake: dict, *, timezone_name: str = DEFAULT_TIMEZONE, twilio_number: str | None = None) -> dict:
    a = intake.get("answers") or {}
    out = {"slug": slug, "timezone": timezone_name}
    out.update({k: a[k] for k in _COPY if a.get(k) not in (None, "", [])})
    if twilio_number:
        out["twilio_number"] = twilio_number
    return out


def area_code(*phones: str | None) -> str | None:
    for p in phones:
        n = norm_phone(p)
        if n:
            return n[2:5]
    return None


# ------------------------------------------------------------------ Twilio (REST, stdlib only)
class Twilio:
    def __init__(self, env, http):
        self.sid, self.token, self.http = env.get("TWILIO_ACCOUNT_SID") or "", env.get("TWILIO_AUTH_TOKEN") or "", http

    @property
    def configured(self) -> bool:
        return bool(self.sid and self.token)

    def _req(self, method: str, url: str, payload=None) -> dict:
        auth = base64.b64encode(f"{self.sid}:{self.token}".encode()).decode()
        text = call(self.http, "twilio", method, url, {"Authorization": f"Basic {auth}"}, payload, form=payload is not None)
        return json.loads(text) if text.strip() else {}

    def _acct(self, path: str) -> str:
        return f"https://api.twilio.com/2010-04-01/Accounts/{self.sid}/{path}"

    def search_local(self, code: str) -> list[str]:
        q = urlencode({"AreaCode": code, "VoiceEnabled": "true", "PageSize": 5})
        r = self._req("GET", self._acct(f"AvailablePhoneNumbers/US/Local.json?{q}"))
        return [n["phone_number"] for n in r.get("available_phone_numbers", []) if (n.get("capabilities") or {}).get("voice", True)]

    def local_monthly_price(self) -> str | None:
        r = self._req("GET", "https://pricing.twilio.com/v1/PhoneNumbers/Countries/US")
        for p in r.get("phone_number_prices", []):
            if p.get("number_type") == "local":
                return str(p.get("current_price") or p.get("base_price") or "") or None
        return None

    def demo_voice_url(self, demo_number: str) -> str | None:
        r = self._req("GET", self._acct(f"IncomingPhoneNumbers.json?{urlencode({'PhoneNumber': demo_number})}"))
        nums = r.get("incoming_phone_numbers", [])
        return nums[0].get("voice_url") if nums else None

    def buy(self, number: str, *, voice_url: str | None, friendly_name: str) -> dict:
        body = {"PhoneNumber": number, "FriendlyName": friendly_name}
        if voice_url:
            body.update(VoiceUrl=voice_url, VoiceMethod="POST")
        return self._req("POST", self._acct("IncomingPhoneNumbers.json"), body)


def inbound_url(env, tw: Twilio) -> str | None:
    """The demo's inbound route (a TwiML Bin that fills in {{To}}/{{From}}), so every client number reuses it."""
    url = (env.get("LP_INBOUND_TWIML_URL") or "").strip()
    if not url and env.get("DEMO_TWILIO_NUMBER"):
        url = (tw.demo_voice_url(env["DEMO_TWILIO_NUMBER"]) or "").strip()
    return url if url.startswith(TWIML_BIN_PREFIX) else None


def tty_confirm(prompt: str) -> bool:
    if not sys.stdin.isatty():
        return False  # never buy from a pipe or CI
    return input(prompt).strip().lower() in ("y", "yes")


def buy_flow(slug: str, code: str | None, *, apply: bool, env, http, out, confirm) -> tuple[str | None, str | None]:
    """Returns (number bought or None, error). Buys only with apply=True AND a typed y."""
    tw = Twilio(env, http)
    if not tw.configured:
        return None, "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set; cannot search for a number"
    if not code:
        return None, "no area code (client has no valid owner phone); pass --area-code"
    try:
        found = tw.search_local(code)
        price = tw.local_monthly_price()
        voice_url = inbound_url(env, tw)
    except Exception as e:
        return None, redact(f"Twilio lookup failed: {e}")
    if not found:
        return None, f"Twilio has no local voice numbers in area code {code}; try --area-code with a nearby one"
    if not price:
        return None, "could not read the monthly price from Twilio; not buying"
    number = found[0]
    out(f"Number found: {number} (area code {code}), about ${price}/month plus usage.")
    out(f"Voice webhook after purchase: {'the demo inbound TwiML Bin (...' + voice_url[-6:] + ')' if voice_url else 'NOT SET (no inbound route found; see manual step below)'}")
    if not apply:
        out("Dry run: nothing bought. Re-run with --apply --buy-number to buy it.")
        return None, None
    if not confirm(f"Buy {number} for ${price}/month for {slug}? [y/N] "):
        out("Not bought (no confirmation).")
        return None, None
    try:
        res = tw.buy(number, voice_url=voice_url, friendly_name=f"LP {slug}")
    except Exception as e:
        return None, redact(f"purchase failed: {e}")
    bought = norm_phone(res.get("phone_number") or number) or number
    out(f"Bought {bought}." + ("" if voice_url else " Voice webhook NOT set: do the manual routing step below."))
    return bought, None if voice_url else "manual-webhook"


def go_live(slug: str, *, env=None, http=urllib_http, out=print) -> int:
    """Final step after a passing test call: clients.status -> live. Touches nothing else."""
    env = os.environ if env is None else env
    db = Supabase(env, http)
    if not db.configured or not _SLUG_RE.match(slug):
        out("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, or invalid slug")
        return 3
    try:
        if not db.client_exists(slug):
            out(f"No clients row for {slug}; run onboard_client.py {slug} --apply first")
            return 2
        db._rest("PATCH", f"clients?slug=eq.{quote(slug, safe='')}", "return=minimal", {"status": "live"})
    except Exception as e:
        out(redact(f"could not set live: {e}"))
        return 3
    out(f"{slug} is live.")
    return 0


# ------------------------------------------------------------------ main flow
def run(slug: str, *, apply: bool = False, buy_number: bool = False, area_code_override: str | None = None,
        timezone_name: str = DEFAULT_TIMEZONE, force: bool = False, clients_dir: Path = CLIENTS_DIR,
        env=None, http=urllib_http, out=print, confirm=tty_confirm) -> int:
    env = os.environ if env is None else env
    if not _SLUG_RE.match(slug):
        out("INVALID slug")
        return 2
    db = Supabase(env, http)
    if not db.configured:
        out("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 3
    try:
        rows = db._rest("GET", f"client_intakes?client_slug=eq.{quote(slug, safe='')}&status=in.(submitted,applied)"
                               "&order=submitted_at.desc&limit=1", "return=representation")
    except Exception as e:
        out(redact(f"could not read client_intakes: {e}"))
        return 3
    if not rows:
        out(f"No submitted intake for {slug}. The client has not finished the form (or no link exists): scripts/new_intake_link.py")
        return 2
    intake = rows[0]
    if intake["status"] == "applied":
        out(f"Note: this intake was already applied on {str(intake.get('applied_at'))[:10]}; running again needs --force to overwrite the YAML.")
    answers = intake_to_answers(slug, intake, timezone_name=timezone_name)
    path = clients_dir / f"{slug}.yaml"
    if apply and path.exists() and not force:
        out(f"{path} already exists; pass --force to overwrite")
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        ipath = Path(tmp) / "intake.yaml"

        def gen(extra_answers: dict, out=out, **kw) -> int:
            ipath.write_text(yaml.safe_dump(extra_answers))
            return new_client.run(ipath, clients_dir=clients_dir, env=env, http=http, out=out, **kw)

        # Validate everything (and show the YAML on a dry run) BEFORE any purchase or write.
        rc = gen(answers, dry_run=True, out=(lambda *_: None) if apply else out)
        if rc != 0:
            if apply:
                gen(answers, dry_run=True)  # the quiet pass hid the reason; show it
            return rc

        number, note = None, None
        if buy_number:
            number, note = buy_flow(slug, area_code_override or area_code(answers.get("owner_phone"), answers.get("handoff_number")),
                                    apply=apply, env=env, http=http, out=out, confirm=confirm)
            if note and note != "manual-webhook":
                out(f"NUMBER: {note}")
        if not apply:
            _print_next_steps(slug, answers, out, number=None, webhook_set=False, applied=False)
            return 0

        if number:
            answers = intake_to_answers(slug, intake, timezone_name=timezone_name, twilio_number=number)
        rc = gen(answers, force=force, status=None)
        if rc != 0:
            if number:
                out(f"WARNING: {number} was bought but the client row/YAML failed. Add it by hand: twilio_number in clients/{slug}.yaml.")
            return rc
    try:
        db._rest("PATCH", f"clients?slug=eq.{quote(slug, safe='')}", "return=minimal", {"tier": intake["tier"]})
        db._rest("PATCH", f"client_intakes?id=eq.{quote(intake['id'], safe='')}", "return=minimal",
                 {"status": "applied", "applied_at": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        out(redact(f"WARNING: could not record tier / mark intake applied: {e}"))
    _print_next_steps(slug, answers, out, number=number, webhook_set=bool(number) and note != "manual-webhook", applied=True)
    return 0


def _print_next_steps(slug: str, answers: dict, out, *, number: str | None, webhook_set: bool, applied: bool) -> None:
    out("\n--- Checklist (no contact details are printed here) ---")
    if not applied:
        out("DRY RUN: nothing was written or bought. Add --apply to write clients/%s.yaml and upsert the clients row." % slug)
    if answers.get("never_say"):
        out(f"NOTE: {len(answers['never_say'])} 'never say' item(s) are saved in the YAML as never_say. The voice agent does not enforce that key yet: "
            "review them and turn each into an approved FAQ answer or ask the agents/ owner to wire it in before go-live.")
    if "es" in (answers.get("languages") or []):
        out("NOTE: Spanish is on. Check the Spanish emergency phrases in emergency_keywords before go-live.")
    if number:
        out(f"Twilio: {number} is bought and in the YAML.")
        out("Twilio: " + ("voice webhook already set to the demo inbound TwiML Bin."
                          if webhook_set else
                          "set it: Console > Phone Numbers > this number > 'A call comes in' = the TwiML Bin from ops/twilio/demo-inbound.twiml.xml."))
    else:
        out("Twilio: buy a local Voice number (or re-run with --apply --buy-number), put it in clients/%s.yaml as twilio_number, then set its "
            "'A call comes in' to the TwiML Bin from ops/twilio/demo-inbound.twiml.xml." % slug)
    out("Then follow ops/onboarding.md: Pipecat secrets (names above), commit clients/%s.yaml, `pipecat cloud deploy`, test call." % slug)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("--apply", action="store_true", help="actually write the YAML and upsert the clients row (default: dry run)")
    ap.add_argument("--buy-number", action="store_true", help="search a local Twilio number; with --apply, buy it after an interactive y/N")
    ap.add_argument("--area-code", help="override the area code derived from the owner's phone")
    ap.add_argument("--timezone", default=DEFAULT_TIMEZONE)
    ap.add_argument("--force", action="store_true", help="overwrite an existing clients/<slug>.yaml")
    ap.add_argument("--go-live", action="store_true", help="only set clients.status = live (after the test call passes)")
    a = ap.parse_args(argv)
    if a.go_live:
        return go_live(a.slug)
    return run(a.slug, apply=a.apply, buy_number=a.buy_number, area_code_override=a.area_code, timezone_name=a.timezone, force=a.force)


if __name__ == "__main__":
    sys.exit(main())
