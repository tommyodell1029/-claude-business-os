"""Spanish/English receptionist: config validation, opening disclosure, prompt rules, fixed lines, STT settings."""
import asyncio
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml  # noqa: E402

from agents.client_config import CLIENTS_DIR, ConfigError, parse  # noqa: E402
from agents.flow import GOODBYE, ReceptionistFlow, init_state, matches_emergency  # noqa: E402
from agents.prompts import role_message  # noqa: E402

DEMO = yaml.safe_load((CLIENTS_DIR / "demo.yaml").read_text())


def bilingual(**over):
    d = copy.deepcopy(DEMO)
    d.update(languages=["en", "es"], greeting_es="¿En qué le puedo ayudar?",
             emergency_keywords=DEMO["emergency_keywords"] + ["inundación", "huele a gas", "incendio"])
    d.update(over)
    return parse(d, "demo")


class FM:
    def __init__(self):
        self.state = {}


class TestBilingual(unittest.TestCase):
    def test_validation(self):
        with self.assertRaises(ConfigError):
            bilingual(greeting_es="")
        with self.assertRaises(ConfigError):
            bilingual(languages=["es"])          # English is always required
        with self.assertRaises(ConfigError):
            bilingual(languages=["en", "fr"])
        self.assertFalse(parse(copy.deepcopy(DEMO), "demo").bilingual)

    def test_opening_has_both_disclosures_english_first(self):
        cfg = bilingual()
        line = ReceptionistFlow(cfg).greeting_node()["pre_actions"][0]["text"]
        self.assertTrue(line.startswith(cfg.disclosure))
        self.assertIn("esta llamada puede ser grabada", line)
        self.assertIn("¿En qué le puedo ayudar?", line)
        self.assertLess(line.index("This call may be recorded"), line.index("puede ser grabada"))

    def test_prompt_language_rules(self):
        self.assertIn("English or Spanish", role_message(bilingual()))
        self.assertIn("Speak English.", role_message(parse(copy.deepcopy(DEMO), "demo")))

    def test_fixed_lines_get_spanish(self):
        flow = ReceptionistFlow(bilingual())
        self.assertIn("Que tenga un buen día", flow.t(GOODBYE))
        fm = FM()
        init_state(fm.state, flow.cfg)
        _, node = asyncio.run(flow.details_confirmed({}, fm))
        self.assertIn("Le pasé su mensaje", node["pre_actions"][0]["text"])
        self.assertEqual(ReceptionistFlow(parse(copy.deepcopy(DEMO), "demo")).t(GOODBYE), GOODBYE)

    def test_spanish_emergency_keywords_with_accents(self):
        kw = bilingual().emergency_keywords
        self.assertEqual(matches_emergency("Hay una INUNDACIÓN en la cocina", kw), "inundación")
        self.assertEqual(matches_emergency("creo que huele a gas", kw), "huele a gas")
        self.assertIsNone(matches_emergency("incendios forestales en la tele", kw))

    def test_stt_multilingual(self):
        from agents.bot import stt_kwargs
        s = stt_kwargs(bilingual())["settings"]
        self.assertEqual((s.model, s.language), ("nova-3", "multi"))
        self.assertEqual(stt_kwargs(parse(copy.deepcopy(DEMO), "demo")), {})


if __name__ == "__main__":
    unittest.main()
