"""Text normalization and redaction utilities."""
import os
import re


_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"xox[bpas]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),  # JWT (Supabase keys)
    re.compile(r"re_[A-Za-z0-9_]{20,}"),  # Resend
    re.compile(r"sb_secret_[A-Za-z0-9_\-]{16,}"),  # Supabase secret key
    re.compile(r"(?i)(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*['\"]?[^\s'\"]{6,}"),
]
_SECRET_ENV = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)", re.I)
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def domain_of(url: str | None) -> str | None:
    """Extract domain from URL, normalized and lowercased.

    Returns None if url is None, empty, or contains no dot.
    Strips www. prefix if present.
    """
    if not url:
        return None
    d = re.sub(r"^[a-z]+://", "", url.strip().lower()).split("/")[0].split("?")[0]
    d = d[4:] if d.startswith("www.") else d
    return d if "." in d else None


def norm_phone(p: str | None) -> str | None:
    """Normalize US phone number to E.164 format.

    Accepts 10 digits or 11 digits starting with 1.
    Rejects if area code or exchange code starts with 0 or 1.
    Returns "+19045551234" format or None.
    """
    if not p:
        return None
    digits = re.sub(r"\D", "", str(p))

    # Accept 11 digits starting with 1, strip the 1
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]

    # Must be exactly 10 digits
    if len(digits) != 10:
        return None

    # Reject if area code (first 3) starts with 0 or 1
    if digits[0] in "01":
        return None

    # Reject if exchange code (digits 3-6) starts with 0 or 1
    if digits[3] in "01":
        return None

    return f"+1{digits}"


def norm_email(e: str | None) -> str | None:
    """Normalize email to lowercase and validate format.

    Returns None if invalid.
    """
    e = (e or "").strip().lower()
    return e if _EMAIL_RE.match(e) else None


def redact(text: str) -> str:
    """Mask secrets from text.

    Masks values of environment variables whose names match KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL,
    plus patterns matching common API keys.
    """
    if text is None:
        return text
    s = str(text)
    for k, v in os.environ.items():
        if _SECRET_ENV.search(k) and v and len(v) >= 6:
            s = s.replace(v, "[REDACTED]")
    for p in _SECRET_PATTERNS:
        s = p.sub("[REDACTED]", s)
    return s
