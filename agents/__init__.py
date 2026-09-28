"""LaunchPad Local voice agent: one Pipecat template, configured per client from clients/<slug>.yaml."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_LIB = str(ROOT / "lib")
if _LIB not in sys.path:
    sys.path.insert(0, _LIB)
