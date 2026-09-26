"""Load config/models.yaml and enforce which component may use which model role."""
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
