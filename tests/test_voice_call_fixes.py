"""Regression tests for the 4 call issues found in text-sim testing (2026-10-01), run as scripted calls
through the real Pipecat pipeline + FlowManager (no keys, no audio):
1. unprompted filler turn   2. double goodbye   3. natural callback times   4. uncovered question -> offer a message
"""
import asyncio
import copy
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loguru import logger  # noqa: E402

logger.remove()

import yaml  # noqa: E402

from agents.client_config import CLIENTS_DIR, load, parse  # noqa: E402
from agents.flow import ES, GOODBYE, MESSAGE_DONE, NOT_COVERED_LINE  # noqa: E402
from agents.prompts import role_message  # noqa: E402
from agents.simulate import simulate  # noqa: E402

DISCLOSURE = "Thanks for calling Harborline Home Services, a LaunchPad Local demo, I'm their AI assistant. This call may be recorded."


def sim(turns, cfg=None, **kw):
    return asyncio.run(simulate(cfg or load("demo"), turns, **kw))


def texts(messages):
    """All developer/system text the LLM saw in one inference."""
    out = []
    for m in messages:
        c = m.get("content") if isinstance(m, dict) else None
        if c is None:
            continue
        out.append(c if isinstance(c, str) else " ".join(p.get("text", "") for p in c if isinstance(p, dict)))
    return "\n".join(out)


class TestCallFixes(unittest.TestCase):
    def setUp(self):
        os.environ["DEMO_HANDOFF_NUMBER"] = "9045550102"

    def tearDown(self):
        os.environ.pop("DEMO_HANDOFF_NUMBER", None)

    # 1 -------------------------------------------------------------------------------------------
    def test_no_filler_when_model_talks_and_calls_a_tool_in_one_response(self):
        r = sim([
            {"caller": "My sink is clogged.", "llm": [
                ("say_call", "Sure, I can help with that.", "set_intent", {"intent": "new_job", "summary": "sink clogged"}),
                ("say", "Can I get your name?")]},
        ])
        self.assertTrue(r.spoken[0].startswith(DISCLOSURE))
        self.assertNotIn("Sure, I can help with that.", r.spoken)
        self.assertEqual(r.spoken[1:], ["Can I get your name?"])
        # what was never spoken is not in the transcript either
        self.assertNotIn("Sure, I can help", r.record["transcript"])

    def test_normal_replies_still_spoken(self):
        r = sim([{"caller": "What are your hours?", "llm": [("call", "set_intent", {"intent": "question"}),
                                                            ("say", "We're open 8 AM to 6 PM on weekdays.")]}])
        self.assertEqual(r.spoken[1:], ["We're open 8 AM to 6 PM on weekdays."])

    # 2 -------------------------------------------------------------------------------------------
    def test_single_goodbye_after_questions(self):
        r = sim([
            {"caller": "What are your hours?", "llm": [("call", "set_intent", {"intent": "question"}),
                                                       ("say", "We're open 8 AM to 6 PM on weekdays.")]},
            {"caller": "Great, that's all. Bye!", "llm": [("say_call", "You're welcome! Have a great day, goodbye!",
                                                          "questions_done", {})]},
        ])
        self.assertTrue(r.ended)
        self.assertEqual(r.spoken[-1], GOODBYE)
        self.assertEqual(sum("goodbye" in s.lower() or "great day" in s.lower() for s in r.spoken), 1, r.spoken)

    def test_single_goodbye_after_message_taken(self):
        r = sim([
            {"caller": "My sink is clogged.", "llm": [("call", "set_intent", {"intent": "new_job", "summary": "sink clogged"}),
                                                      ("say", "Can I get your name and number?")]},
            {"caller": "Ann, 904-555-0133", "llm": [("call", "save_caller_details", {"name": "Ann", "callback_number": "904-555-0133",
                                                                                     "need": "sink clogged", "urgency": "normal"}),
                                                    ("say", "Ann at 9 0 4 5 5 5 0 1 3 3, sink clogged. Is that right?")]},
            {"caller": "Yes, thanks, bye", "llm": [("say_call", "Perfect, thanks Ann. Goodbye!", "details_confirmed", {})]},
        ])
        self.assertEqual(r.spoken[-1], f"{MESSAGE_DONE} {GOODBYE}")
        self.assertEqual(sum("goodbye" in s.lower() or "great day" in s.lower() for s in r.spoken), 1, r.spoken)

    def test_prompt_forbids_own_goodbye(self):
        self.assertIn("Never say goodbye yourself", role_message(load("demo")))

    # 3 -------------------------------------------------------------------------------------------
    def test_natural_callback_time_is_accepted_and_read_back(self):
        r = sim([
            {"caller": "My AC is making a noise.", "llm": [("call", "set_intent", {"intent": "new_job", "summary": "AC noise"}),
                                                           ("say", "Can I get your name and number?")]},
            {"caller": "Cy, 904 555 0135, tomorrow morning is best", "llm": [
                ("call", "save_caller_details", {"name": "Cy", "callback_number": "904 555 0135", "need": "AC noise",
                                                 "urgency": "normal", "best_time": "tomorrow morning"}),
                ("say", "Cy, 9 0 4 5 5 5 0 1 3 5, AC noise, best time tomorrow morning. Is that right?")]},
            {"caller": "Yes", "llm": [("call", "details_confirmed", {})]},
        ])
        self.assertEqual(r.state["caller"]["best_time"], "tomorrow morning")
        self.assertIn("tomorrow morning", r.spoken[-2])
        # the collect + confirm prompts the model actually saw tell it to take natural times as said
        dev = [texts([m]) for m in r.prompts[-1] if m.get("role") in ("developer", "system")]
        collect_prompt = next(p for p in dev if p.startswith("Collect"))
        confirm_prompt = next(p for p in dev if p.startswith("Read the details back"))
        for p in (collect_prompt, confirm_prompt):
            self.assertIn("tomorrow morning", p)
        self.assertIn("Accept natural times", collect_prompt)
        self.assertIn("in the caller's own words", confirm_prompt)
        self.assertIn("never ask for an exact time", collect_prompt.lower())

    def test_role_message_time_rule_never_promises(self):
        p = role_message(load("demo"))
        self.assertIn("Accept natural callback or appointment times", p)
        self.assertIn("the team will confirm", p)
        self.assertIn("Never promise availability", p)

    def test_request_time_node_accepts_natural_times(self):
        d = yaml.safe_load((CLIENTS_DIR / "demo.yaml").read_text())
        d = copy.deepcopy(d)
        d["booking_method"] = {"type": "request_time"}
        from agents.flow import ReceptionistFlow
        task = ReceptionistFlow(parse(d, "demo")).request_time_node()["task_messages"][0]["content"]
        self.assertIn("Accept natural times", task)
        self.assertIn("Do not promise", task)

    # 4 -------------------------------------------------------------------------------------------
    def test_uncovered_question_offers_to_take_a_message(self):
        r = sim([
            {"caller": "Do you install solar panels?", "llm": [("call", "set_intent", {"intent": "question"}),
                                                               ("call", "question_not_covered", {"topic": "solar panels"})]},
            {"caller": "Yes please", "llm": [("call", "needs_followup", {}), ("say", "Sure. What's your name?")]},
        ])
        self.assertIn(NOT_COVERED_LINE, r.spoken)
        self.assertIn("take a message", NOT_COVERED_LINE)
        self.assertIn("don't have that information", NOT_COVERED_LINE)
        self.assertEqual(r.spoken[-1], "Sure. What's your name?")
        self.assertEqual(r.state["caller"].get("unanswered_question"), "solar panels")
        self.assertIn("asked (not in our info): solar panels", r.record["summary"])

    def test_uncovered_price_question_uses_fixed_line(self):
        r = sim([
            {"caller": "How much is a new water heater?", "llm": [
                ("call", "set_intent", {"intent": "question"}),
                ("say_call", "Water heaters usually run about", "question_not_covered", {"topic": "water heater price"})]},
            {"caller": "No thanks, that's all", "llm": [("call", "questions_done", {})]},
        ])
        self.assertIn(NOT_COVERED_LINE, r.spoken)
        self.assertFalse(any("usually run" in s for s in r.spoken))
        self.assertEqual(r.spoken[-1], GOODBYE)

    def test_faq_prompt_routes_uncovered_questions(self):
        from agents.flow import ReceptionistFlow
        flow = ReceptionistFlow(load("demo"))
        node = flow.faq_node()
        self.assertIn("question_not_covered", node["task_messages"][0]["content"])
        self.assertIn("question_not_covered", {f.name for f in node["functions"]})
        self.assertIn("question_not_covered", {f.name for f in flow.greeting_node()["functions"]})

    def test_not_covered_line_is_bilingual(self):
        self.assertIn(NOT_COVERED_LINE, ES)
        self.assertIn("tomar un mensaje", ES[NOT_COVERED_LINE])


if __name__ == "__main__":
    unittest.main()
