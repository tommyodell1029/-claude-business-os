"""Load config/models.yaml and enforce which component may use which model role."""
import os
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
MODELS_FILE = ROOT / "config" / "models.yaml"


@lru_cache(maxsize=1)
def _models(path: str = str(MODELS_FILE)) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def model(role: str, component: str) -> str:
    """Return the model ID for `role`, refusing roles the component is not allowed to use."""
    cfg = _models()
    if role not in cfg.get("allowed", {}).get(component, []):
        raise PermissionError(f"component {component!r} may not use model role {role!r}")
    return cfg["models"][role]


# The Claude Code cloud environment may withhold ANTHROPIC_* variables from sessions, so the owner can
# store the runtime key as LP_ANTHROPIC_API_KEY instead. ANTHROPIC_API_KEY wins when both are set.
ANTHROPIC_KEY_VARS = ("ANTHROPIC_API_KEY", "LP_ANTHROPIC_API_KEY")


def anthropic_api_key() -> str | None:
    """Return the Anthropic API key from ANTHROPIC_API_KEY, else LP_ANTHROPIC_API_KEY, else None."""
    for name in ANTHROPIC_KEY_VARS:
        if v := os.getenv(name, "").strip():
            return v
    return None
