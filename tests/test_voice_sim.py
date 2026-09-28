"""Scripted end-to-end calls through the real Pipecat pipeline + FlowManager (no keys, no audio)."""
import asyncio
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loguru import logger  # noqa: E402

logger.remove()

from pipecat.frames.frames import TranscriptionFrame  # noqa: E402
from pipecat.tests.utils import run_test  # noqa: E402

from agents.client_config import load  # noqa: E402
from agents.flow import HOLD_LINE, NO_ANSWER_LINE, ReceptionistFlow, init_state  # noqa: E402
from agents.guards import EmergencyWatcher  # noqa: E402
from agents.simulate import simulate  # noqa: E402


def sim(turns, **kw):
    return asyncio.run(simulate(load("demo"), turns, **kw))


class Unanswered:
    async def transfer(self, fm, to):
        return "unavailable"


class TestScriptedCalls(unittest.TestCase):
    def setUp(self):
        os.environ["DEMO_HANDOFF_NUMBER"] = "9045550102"

    def tearDown(self):
        os.environ.pop("DEMO_HANDOFF_NUMBER", None)

    def assert_disclosed(self, r):
        self.assertTrue(r.spoken[0].startswith("Thanks for calling Harborline Home Services, a LaunchPad Local demo, "
                                               "I'm their AI assistant. This call may be recorded."))
        self.assertTrue(r.record["disclosure_spoken"])

    def test_normal_message(self):
        r = sim([
            {"caller": "My sink is clogged.", "llm": [("call", "set_intent", {"intent": "new_job", "summary": "sink clogged"}),
                                                      ("say", "Can I get your name and number?")]},
            {"caller": "Ann, 904-555-0133", "llm": [("call", "save_caller_details", {"name": "Ann", "callback_number": "904-555-0133",
                                                                                     "need": "sink clogged", "urgency": "normal"}),
                                                    ("say", "Ann at 9 0 4 5 5 5 0 1 3 3, sink clogged. Correct?")]},
            {"caller": "Yes", "llm": [("call", "details_confirmed", {})]},
        ])
        self.assert_disclosed(r)
        self.assertTrue(r.ended)
        self.assertEqual(r.record["urgency"], "normal")
        self.assertEqual(r.record["caller_phone"], "+19045550133")
        self.assertIn("they'll follow up", r.spoken[-1])

    def test_faq_then_done(self):
        r = sim([
            {"caller": "Do you charge for estimates?", "llm": [("call", "set_intent", {"intent": "question"}),
                                                              ("say", "A technician gives you an exact quote after looking at the job.")]},
            {"caller": "OK thanks, that's all.", "llm": [("call", "questions_done", {})]},
        ])
        self.assert_disclosed(r)
        self.assertTrue(r.ended)
        self.assertEqual(r.state["intent"], "question")
        self.assertEqual(r.state["end_reason"], "completed")

    def test_emergency_unanswered_transfer_takes_urgent_message(self):
        r = sim([
            {"caller": "Water is flooding my kitchen!", "llm": [("call", "set_intent", {"intent": "emergency", "summary": "kitchen flooding"})]},
            {"caller": "Bo, 904 555 0134", "llm": [("call", "save_caller_details", {"name": "Bo", "callback_number": "9045550134",
                                                                                   "need": "kitchen flooding", "urgency": "urgent"}),
                                                   ("say", "Bo, 9 0 4 5 5 5 0 1 3 4, flooding. Correct?")]},
            {"caller": "Yes", "llm": [("call", "details_confirmed", {})]},
        ], transferer=Unanswered())
        self.assertIn(HOLD_LINE, r.spoken)
        self.assertIn(NO_ANSWER_LINE, r.spoken)
        self.assertEqual(r.record["urgency"], "urgent")
        self.assertEqual(r.record["intent"], "emergency")
        self.assertIn("marked this urgent", r.spoken[-1])

    def test_spam_is_ended(self):
        r = sim([{"caller": "Hi, I'm calling about your business's Google listing, special offer.",
                  "llm": [("call", "end_call", {"reason": "spam"})]}])
        self.assertTrue(r.ended)
        self.assertEqual(r.record["end_reason"], "spam")
        self.assertEqual(r.record["intent"], "spam")


class TestEmergencyWatcher(unittest.TestCase):
    def test_keyword_in_transcript_forces_transfer(self):
        os.environ["DEMO_HANDOFF_NUMBER"] = "9045550102"
        try:
            cfg = load("demo")
        finally:
            os.environ.pop("DEMO_HANDOFF_NUMBER", None)
        flow = ReceptionistFlow(cfg)

        class FM:
            state = {}
            nodes = []

            async def set_node_from_config(self, node):
                FM.nodes.append(node)

        fm = FM()
        init_state(fm.state, cfg)
        w = EmergencyWatcher(flow, cfg.emergency_keywords)
        w.fm = fm
        frames = [TranscriptionFrame("hello", "u", "t"), TranscriptionFrame("I smell gas", "u", "t")]
        asyncio.run(run_test(w, frames_to_send=frames, expected_down_frames=[TranscriptionFrame, TranscriptionFrame]))
        self.assertTrue(fm.state["transfer_attempted"])
        self.assertEqual(fm.state["urgency"], "urgent")
        self.assertEqual(FM.nodes[-1]["name"], "transfer")


if __name__ == "__main__":
    unittest.main()
