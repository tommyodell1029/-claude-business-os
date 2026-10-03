"""Lead generation: Places sourcing -> research -> score -> draft. See README.md. Never sends email."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for _p in (str(ROOT / "lib"), str(ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)
