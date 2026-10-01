"""Billing-date rules from config/offerings.yaml (owner-approved 2026-10-01)."""
from datetime import date


def _add_months_first(d: date, months: int) -> date:
    m = d.month - 1 + months
    return date(d.year + m // 12, m % 12 + 1, 1)


def first_recurring_charge(setup_date: date, *, founding: bool) -> date:
    """Founding clients: setup paid any day in month M -> month M+1 free -> first charge on the 1st of M+2.
    Standard clients: first charge one month after setup (same day of month, clamped to month end)."""
    if founding:
        return _add_months_first(setup_date, 2)
    nxt = _add_months_first(setup_date, 1)
    last_day = (_add_months_first(nxt, 1) - nxt).days
    return nxt.replace(day=min(setup_date.day, last_day))
