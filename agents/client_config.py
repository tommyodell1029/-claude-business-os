"""Load and validate clients/<slug>.yaml. Invalid config never reaches a live call."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml

from . import ROOT
from lp.text import norm_email, norm_phone

CLIENTS_DIR = ROOT / "clients"
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
BOOKING_TYPES = ("take_message", "request_time")
TTS_PROVIDERS = ("elevenlabs", "cartesia")
LANGUAGES = ("en", "es")
_HOURS_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$")
_ENV_RE = re.compile(r"^\$\{([A-Z0-9_]+)\}$")
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


class ConfigError(ValueError):
    def __init__(self, slug: str, errors: list[str]):
        self.errors = errors
        super().__init__(f"clients/{slug}.yaml invalid: " + "; ".join(errors))


@dataclass(frozen=True)
class ClientConfig:
    slug: str
    business_name: str
    industry: str
    timezone: str
    hours: dict[str, str]
    services: list[str]
    service_area: list[str]
    faqs: list[dict[str, str]]
    booking_type: str
    owner_phone: str | None
    owner_email: str | None
    handoff_number: str | None
    emergency_keywords: list[str]
    tts_provider: str
    voice_id: str
    greeting: str
    max_call_minutes: int
    silence_timeout_secs: int
    twilio_number: str | None = None
    languages: tuple[str, ...] = ("en",)
    raw: dict = field(default_factory=dict, compare=False, repr=False)

    @property
    def disclosure(self) -> str:
        # Mandatory (Florida all-party consent). Built in code so no client config can remove it.
        return f"Thanks for calling {self.business_name}, I'm their AI assistant. This call may be recorded."

    @property
    def bilingual(self) -> bool:
        return "es" in self.languages

    @property
    def disclosure_es(self) -> str:
        # Spanish disclosure, spoken right after the English one for bilingual clients (also built in code).
        return "Gracias por llamar. Soy su asistente de inteligencia artificial y esta llamada puede ser grabada."


def _env(value, required_env: bool):
    """Resolve '${VAR}' from the environment. Returns (value, error)."""
    if not isinstance(value, str):
        return value, None
    m = _ENV_RE.match(value.strip())
    if not m:
        return value, None
    resolved = os.environ.get(m.group(1))
    if not resolved and required_env:
        return None, f"environment variable {m.group(1)} is not set"
    return resolved or None, None


def parse(data: dict, slug: str, *, require_env: bool = False) -> ClientConfig:
    """Validate a client dict. `require_env=True` is used at deploy time so ${VAR} secrets must exist."""
    errs: list[str] = []
    if not isinstance(data, dict):
        raise ConfigError(slug, ["file is not a mapping"])

    def need_str(key: str) -> str:
        v = data.get(key)
        if not isinstance(v, str) or not v.strip():
            errs.append(f"{key} is required")
            return ""
        return v.strip()

    def str_list(key: str, required: bool = True) -> list[str]:
        v = data.get(key) or []
        if not isinstance(v, list) or not all(isinstance(x, str) and x.strip() for x in v):
            errs.append(f"{key} must be a list of strings")
            return []
        if required and not v:
            errs.append(f"{key} must not be empty")
        return [x.strip() for x in v]

    if data.get("slug") != slug or not _SLUG_RE.match(slug):
        errs.append(f"slug must equal the file name and match {_SLUG_RE.pattern}")
    business_name = need_str("business_name")
    industry = need_str("industry")
    tz = need_str("timezone")
    if tz:
        try:
            ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError):
            errs.append(f"timezone {tz!r} is not a valid IANA zone")

    hours = data.get("hours") or {}
    if not isinstance(hours, dict) or set(hours) != set(DAYS):
        errs.append(f"hours must list exactly {', '.join(DAYS)}")
        hours = {}
    for d, v in hours.items():
        if not (v == "closed" or (isinstance(v, str) and _HOURS_RE.match(v))):
            errs.append(f"hours.{d} must be 'HH:MM-HH:MM' or 'closed'")

    services = str_list("services")
    service_area = str_list("service_area")
    faqs = data.get("faqs") or []
    if not isinstance(faqs, list) or not all(
        isinstance(f, dict) and isinstance(f.get("q"), str) and isinstance(f.get("a"), str) and f["q"].strip() and f["a"].strip()
        for f in faqs
    ):
        errs.append("faqs must be a list of {q, a} with non-empty strings")
        faqs = []
    for f in faqs:
        if "{{" in f["q"] + f["a"]:
            errs.append("faqs must not contain '{{' (reserved for template variables)")

    booking = data.get("booking_method") or {}
    booking_type = booking.get("type") if isinstance(booking, dict) else None
    if booking_type not in BOOKING_TYPES:
        errs.append(f"booking_method.type must be one of {BOOKING_TYPES}")

    contacts = {}
    for key, norm in (("owner_phone", norm_phone), ("owner_email", norm_email), ("handoff_number", norm_phone), ("twilio_number", norm_phone)):
        v, e = _env(data.get(key), require_env)
        if e:
            errs.append(f"{key}: {e}")
        if v is not None and norm(str(v)) is None:
            errs.append(f"{key} is not a valid {'email' if key == 'owner_email' else 'US phone number'}")
        contacts[key] = norm(str(v)) if v is not None else None
    if require_env and not (contacts["owner_phone"] or contacts["owner_email"]):
        errs.append("owner_phone or owner_email is required so call alerts reach someone")

    keywords = [k.lower() for k in str_list("emergency_keywords")]

    tts = data.get("tts") or {}
    tts_provider = tts.get("provider") if isinstance(tts, dict) else None
    voice_id = tts.get("voice_id") if isinstance(tts, dict) else None
    if tts_provider not in TTS_PROVIDERS:
        errs.append(f"tts.provider must be one of {TTS_PROVIDERS}")
    if not isinstance(voice_id, str) or not voice_id.strip():
        errs.append("tts.voice_id is required")

    greeting = need_str("greeting")
    langs = data.get("languages", ["en"])
    if not isinstance(langs, list) or not langs or "en" not in langs or any(l not in LANGUAGES for l in langs):
        errs.append(f"languages must be a list containing 'en' and only {LANGUAGES}")
        langs = ["en"]
    greeting_es = data.get("greeting_es")
    if "es" in langs and (not isinstance(greeting_es, str) or not greeting_es.strip()):
        errs.append("greeting_es is required when languages includes 'es'")

    def bounded_int(key: str, lo: int, hi: int) -> int:
        v = data.get(key)
        if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
            errs.append(f"{key} must be an integer between {lo} and {hi}")
            return lo
        return v

    max_minutes = bounded_int("max_call_minutes", 1, 20)
    silence = bounded_int("silence_timeout_secs", 5, 60)

    if errs:
        raise ConfigError(slug, errs)
    return ClientConfig(
        slug=slug, business_name=business_name, industry=industry, timezone=tz, hours=dict(hours),
        services=services, service_area=service_area, faqs=[{"q": f["q"].strip(), "a": f["a"].strip()} for f in faqs],
        booking_type=booking_type, owner_phone=contacts["owner_phone"], owner_email=contacts["owner_email"],
        handoff_number=contacts["handoff_number"], emergency_keywords=keywords, tts_provider=tts_provider,
        voice_id=voice_id.strip(), greeting=greeting, max_call_minutes=max_minutes, silence_timeout_secs=silence,
        twilio_number=contacts["twilio_number"], languages=tuple(dict.fromkeys(langs)), raw=data,
    )


def load(slug: str, *, require_env: bool = False, clients_dir: Path = CLIENTS_DIR) -> ClientConfig:
    if not _SLUG_RE.match(slug):
        raise ConfigError(slug, ["invalid slug"])
    path = clients_dir / f"{slug}.yaml"
    with open(path) as f:
        return parse(yaml.safe_load(f), slug, require_env=require_env)


def slug_for_number(dialed: str | None, *, clients_dir: Path = CLIENTS_DIR) -> str | None:
    """Map the dialed Twilio number to a client slug. None if unknown."""
    target = norm_phone(dialed)
    if not target:
        return None
    for path in sorted(clients_dir.glob("*.yaml")):
        try:
            cfg = load(path.stem, clients_dir=clients_dir)
        except (ConfigError, OSError, yaml.YAMLError):
            continue
        if cfg.twilio_number == target:
            return cfg.slug
    return None
