"""Receptionist call flow (Pipecat Flows).

greet+disclose -> triage -> {faq | collect} -> [request_time] -> confirm -> end
Global at every node: transfer_to_human (emergency / asks for a person), end_call (abuse / spam).
Deterministic backup: EmergencyWatcher forces a transfer when a configured keyword is heard.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any, Protocol

from pipecat.flows import FlowManager, FlowsFunctionSchema, NodeConfig

from lp.text import norm_phone

from .client_config import ClientConfig
from .prompts import role_message

INTENTS = ("new_job", "question", "existing_customer", "emergency", "spam", "other")
URGENCY = ("normal", "urgent")

GOODBYE = "Thank you for calling. Have a great day."
HOLD_LINE = "One moment. I'm connecting you now."
NO_ANSWER_LINE = (
    "I wasn't able to reach anyone right now, so I'll take a message and mark it urgent. "
    "What's your name?"
)
URGENT_DONE = "Thanks. I've marked this urgent and passed it to the team right away."
MESSAGE_DONE = "Thanks. I've passed your message to the team, and they'll follow up."
SPAM_BYE = "Thank you for calling. Goodbye."
NOT_COVERED_LINE = ("I'm sorry, I don't have that information. I can take a message for the team so they can "
                    "follow up with you. Would you like me to do that?")
# Natural-language times are fine; the team confirms real appointments. Shared by collect/request_time/confirm.
TIME_RULE = ("Accept natural times exactly as the caller says them, like \"tomorrow morning\", \"after 3 on Friday\", "
             "or \"anytime\"; never ask for an exact time or date, and don't convert it. Do not promise that the time "
             "is available; say the team will confirm.")

# Spanish versions of every fixed line, spoken after the English one on bilingual lines.
ES = {
    GOODBYE: "Gracias por llamar. Que tenga un buen día.",
    HOLD_LINE: "Un momento, por favor. Le estoy comunicando.",
    NO_ANSWER_LINE: ("No pude comunicarme con nadie en este momento, así que tomaré un mensaje y lo marcaré como urgente. "
                     "¿Cuál es su nombre?"),
    URGENT_DONE: "Gracias. Lo marqué como urgente y se lo pasé al equipo de inmediato.",
    MESSAGE_DONE: "Gracias. Le pasé su mensaje al equipo y se comunicarán con usted.",
    SPAM_BYE: "Gracias por llamar. Adiós.",
    NOT_COVERED_LINE: ("Lo siento, no tengo esa información. Puedo tomar un mensaje para el equipo para que se "
                       "comuniquen con usted. ¿Le gustaría que lo haga?"),
}


class Transferer(Protocol):
    async def transfer(self, flow_manager: FlowManager, to_number: str) -> str:
        """Start a transfer. Returns 'initiated' (telephony now owns the call) or 'unavailable'."""


class NoTransfer:
    """Used when no telephony transfer is possible (local tests, missing handoff number)."""

    async def transfer(self, flow_manager: FlowManager, to_number: str) -> str:
        return "unavailable"


def matches_emergency(text: str, keywords: list[str]) -> str | None:
    t = (text or "").lower()
    for k in keywords:
        if re.search(rf"(?<!\w){re.escape(k)}(?!\w)", t):
            return k
    return None


def init_state(state: dict, cfg: ClientConfig) -> None:
    state.setdefault("client_slug", cfg.slug)
    state.setdefault("caller", {})
    state.setdefault("intent", None)
    state.setdefault("urgency", "normal")
    state.setdefault("transfer_attempted", False)
    state.setdefault("transferred", False)
    state.setdefault("end_reason", None)
    state.setdefault("confirmed", False)
    state.setdefault("disclosure_spoken", False)


class ReceptionistFlow:
    def __init__(self, cfg: ClientConfig, transferer: Transferer | None = None):
        self.cfg = cfg
        self.transferer = transferer or NoTransfer()

    # ------------------------------------------------------------------ nodes
    def _node(self, name: str, task: str, functions: list, **extra) -> NodeConfig:
        node: NodeConfig = {"name": name, "task_messages": [{"role": "developer", "content": task}], "functions": functions}
        node.update(extra)
        return node

    def greeting_node(self) -> NodeConfig:
        return self._node(
            "triage",
            "You just greeted the caller. Listen to why they are calling and identify their intent: "
            "a new job or appointment, a question, an existing customer, an emergency, or spam/sales. "
            "As soon as the intent is clear, call set_intent. For emergencies call transfer_to_human instead. "
            "If they ask something the business facts don't answer, call question_not_covered.",
            [self._set_intent_fn(), self._not_covered_fn()],
            role_message=role_message(self.cfg),
            pre_actions=[{"type": "tts_say", "text": self.opening_line()},
                         {"type": "function", "handler": self._mark_disclosed}],
            respond_immediately=False,
        )

    def t(self, text: str) -> str:
        """Fixed line in English, followed by Spanish on bilingual lines."""
        return f"{text} {ES[text]}" if self.cfg.bilingual and text in ES else text

    def opening_line(self) -> str:
        """English disclosure first (always), then the Spanish disclosure for bilingual clients, then greetings."""
        if self.cfg.bilingual:
            return f"{self.cfg.disclosure} {self.cfg.disclosure_es} {self.cfg.greeting} {self.cfg.raw['greeting_es'].strip()}"
        return f"{self.cfg.disclosure} {self.cfg.greeting}"

    def faq_node(self, not_covered: bool = False) -> NodeConfig:
        # not_covered: the caller just asked something the config doesn't answer. Speak the fixed line (no LLM
        # wording, so it can't guess) and wait for their answer.
        extra = ({"pre_actions": [{"type": "tts_say", "text": self.t(NOT_COVERED_LINE)}], "respond_immediately": False}
                 if not_covered else {})
        return self._node(
            "faq",
            "Answer the caller's questions using ONLY the business facts in your instructions. "
            "If the business facts don't answer a question, or it asks about a price or cost, do not answer it: "
            "call question_not_covered. "
            "If they want service, a callback, or a message taken, call needs_followup. "
            "If they have no more questions and need nothing else, call questions_done. "
            "Never say goodbye yourself; questions_done says it.",
            [self._needs_followup_fn(), self._questions_done_fn(), self._not_covered_fn()],
            **extra,
        )

    def collect_node(self, urgent: bool = False) -> NodeConfig:
        opener = [{"type": "tts_say", "text": self.t(NO_ANSWER_LINE)}] if urgent else []
        return self._node(
            "collect",
            "Collect, one question at a time: the caller's name, the best callback number, what they need, "
            "the service address or area if relevant, how urgent it is, and the best time to reach them. "
            "If they're calling from the number they want a callback on, you may confirm that instead of asking. "
            f"For the best time: {TIME_RULE} "
            "When you have them, call save_caller_details.",
            [self._save_details_fn()],
            pre_actions=opener,
            respond_immediately=not urgent,
        )

    def request_time_node(self) -> NodeConfig:
        return self._node(
            "request_time",
            "Ask what day and time would work best for an appointment. "
            f"{TIME_RULE} Then call save_preferred_time.",
            [self._save_time_fn()],
        )

    def confirm_node(self) -> NodeConfig:
        return self._node(
            "confirm",
            "Read the details back to the caller briefly: name, callback number digit by digit, what they need, "
            "and the best time in the caller's own words (for example \"tomorrow morning\"), adding that the team "
            "will confirm. Ask if that's correct. If something is wrong, call correct_detail. "
            "When they confirm, call details_confirmed. Never say goodbye yourself; details_confirmed says it.",
            [self._correct_fn(), self._confirmed_fn()],
        )

    def end_node(self, text: str | None = None) -> NodeConfig:
        text = text or self.t(GOODBYE)
        return self._node("end", "The call is ending. Do not say anything else.", [],
                          pre_actions=[{"type": "end_conversation", "text": text}], respond_immediately=False)

    def transfer_node(self) -> NodeConfig:
        return self._node("transfer", "You are transferring the caller. Do not say anything else.", [],
                          pre_actions=[{"type": "tts_say", "text": self.t(HOLD_LINE)},
                                       {"type": "function", "handler": self._do_transfer}],
                          respond_immediately=False)

    def global_functions(self) -> list[FlowsFunctionSchema]:
        return [
            FlowsFunctionSchema(
                name="transfer_to_human",
                description="Transfer the caller to a person. Use for emergencies or when the caller asks for a human.",
                properties={"reason": {"type": "string", "enum": ["emergency", "caller_requested"]},
                            "details": {"type": "string", "description": "Short description of the situation"}},
                required=["reason"],
                handler=self.transfer_to_human,
            ),
            FlowsFunctionSchema(
                name="end_call",
                description="End the call politely. Only for abusive callers, robocalls, or sales/spam calls.",
                properties={"reason": {"type": "string", "enum": ["abusive", "spam"]}},
                required=["reason"],
                handler=self.end_call,
            ),
        ]

    # ------------------------------------------------------------------ handlers
    async def set_intent(self, args: dict, fm: FlowManager):
        intent = args.get("intent")
        if intent not in INTENTS:
            return {"error": f"intent must be one of {INTENTS}"}, None
        fm.state["intent"] = intent
        if args.get("summary"):
            fm.state["caller"]["need"] = args["summary"]
        if intent == "emergency" or matches_emergency(args.get("summary", ""), self.cfg.emergency_keywords):
            return await self.transfer_to_human({"reason": "emergency", "details": args.get("summary", "")}, fm)
        if intent == "spam":
            return await self.end_call({"reason": "spam"}, fm)
        if intent == "question":
            return {"status": "ok"}, self.faq_node()
        return {"status": "ok"}, self.collect_node()

    async def question_not_covered(self, args: dict, fm: FlowManager):
        if args.get("topic"):
            fm.state["caller"]["unanswered_question"] = str(args["topic"]).strip()[:200]
        if fm.state.get("intent") is None:
            fm.state["intent"] = "question"
        return {"status": "offered_message"}, self.faq_node(not_covered=True)

    async def needs_followup(self, args: dict, fm: FlowManager):
        return {"status": "ok"}, self.collect_node()

    async def questions_done(self, args: dict, fm: FlowManager):
        fm.state["end_reason"] = "completed"
        return {"status": "ok"}, self.end_node()

    async def save_caller_details(self, args: dict, fm: FlowManager):
        callback = norm_phone(args.get("callback_number"))
        if not args.get("name") or not args.get("need"):
            return {"error": "name and need are required; ask the caller"}, None
        if not callback:
            return {"error": "callback_number is not a valid 10-digit US number; ask the caller to repeat it"}, None
        urgency = args.get("urgency") if args.get("urgency") in URGENCY else "normal"
        if matches_emergency(args.get("need", ""), self.cfg.emergency_keywords) or fm.state.get("urgency") == "urgent":
            urgency = "urgent"
        fm.state["caller"].update({
            "name": args["name"].strip(), "callback_number": callback, "need": args["need"].strip(),
            "address": (args.get("address") or "").strip() or None, "best_time": (args.get("best_time") or "").strip() or None,
        })
        fm.state["urgency"] = urgency
        if self.cfg.booking_type == "request_time" and fm.state.get("intent") in ("new_job", "existing_customer"):
            return {"status": "saved"}, self.request_time_node()
        return {"status": "saved"}, self.confirm_node()

    async def save_preferred_time(self, args: dict, fm: FlowManager):
        fm.state["caller"]["preferred_time"] = (args.get("preferred_time") or "").strip() or None
        return {"status": "saved"}, self.confirm_node()

    async def correct_detail(self, args: dict, fm: FlowManager):
        field, value = args.get("field"), (args.get("value") or "").strip()
        allowed = ("name", "callback_number", "need", "address", "best_time", "preferred_time")
        if field not in allowed or not value:
            return {"error": f"field must be one of {allowed} with a value"}, None
        if field == "callback_number":
            value = norm_phone(value)
            if not value:
                return {"error": "not a valid 10-digit US number; ask again"}, None
        fm.state["caller"][field] = value
        return {"status": "updated"}, None

    async def details_confirmed(self, args: dict, fm: FlowManager):
        fm.state["confirmed"] = True
        fm.state["end_reason"] = "completed"
        line = URGENT_DONE if fm.state.get("urgency") == "urgent" else MESSAGE_DONE
        return {"status": "ok"}, self.end_node(f"{self.t(line)} {self.t(GOODBYE)}")

    async def transfer_to_human(self, args: dict, fm: FlowManager):
        reason = args.get("reason", "caller_requested")
        if reason == "emergency":
            fm.state["urgency"] = "urgent"
            fm.state["intent"] = "emergency"
        if args.get("details"):
            fm.state["caller"].setdefault("need", args["details"])
        already = fm.state.get("transfer_attempted")
        fm.state["transfer_attempted"] = True
        if already or not self.cfg.handoff_number:
            fm.state["urgency"] = "urgent"
            if already and fm.state.get("caller", {}).get("callback_number"):
                return {"status": "transfer_unavailable", "note": "details already saved"}, None
            return {"status": "transfer_unavailable"}, self.collect_node(urgent=True)
        return {"status": "transferring"}, self.transfer_node()

    async def end_call(self, args: dict, fm: FlowManager):
        reason = args.get("reason") if args.get("reason") in ("abusive", "spam") else "spam"
        fm.state["end_reason"] = reason
        if fm.state.get("intent") is None:
            fm.state["intent"] = "spam"
        return {"status": "ending"}, self.end_node(self.t(SPAM_BYE))

    async def _mark_disclosed(self, action: dict, fm: FlowManager) -> None:
        fm.state["disclosure_spoken"] = True

    async def _do_transfer(self, action: dict, fm: FlowManager) -> None:
        result = await self.transferer.transfer(fm, self.cfg.handoff_number)
        if result == "initiated":
            fm.state["transferred"] = True
            fm.state["end_reason"] = "transferred"
            return
        fm.state["urgency"] = "urgent"
        # Runs inside the transfer node's pre-actions; setting a node from here would re-enter the
        # in-progress transition and deadlock, so schedule it.
        self._pending = asyncio.create_task(fm.set_node_from_config(self.collect_node(urgent=True)))

    # ------------------------------------------------------------------ function schemas
    def _set_intent_fn(self):
        return FlowsFunctionSchema(
            name="set_intent", description="Record why the caller is calling.",
            properties={"intent": {"type": "string", "enum": list(INTENTS)},
                        "summary": {"type": "string", "description": "One sentence in the caller's words"}},
            required=["intent"], handler=self.set_intent)

    def _not_covered_fn(self):
        return FlowsFunctionSchema(
            name="question_not_covered",
            description="The caller asked something the business facts don't answer (including any price or cost). "
                        "Speaks a fixed line saying you don't have that information and offering to take a message.",
            properties={"topic": {"type": "string", "description": "A few words on what they asked"}},
            required=[], handler=self.question_not_covered)

    def _needs_followup_fn(self):
        return FlowsFunctionSchema(name="needs_followup", description="Caller wants service, a callback, or a message taken.",
                                   properties={}, required=[], handler=self.needs_followup)

    def _questions_done_fn(self):
        return FlowsFunctionSchema(name="questions_done", description="Caller's questions are answered and they need nothing else.",
                                   properties={}, required=[], handler=self.questions_done)

    def _save_details_fn(self):
        s = {"type": "string"}
        return FlowsFunctionSchema(
            name="save_caller_details", description="Save the caller's details once collected.",
            properties={"name": s, "callback_number": s, "need": s, "address": s,
                        "urgency": {"type": "string", "enum": list(URGENCY)},
                        "best_time": {"type": "string", "description": "In the caller's words, e.g. 'tomorrow morning'"}},
            required=["name", "callback_number", "need", "urgency"], handler=self.save_caller_details)

    def _save_time_fn(self):
        return FlowsFunctionSchema(name="save_preferred_time", description="Save the caller's preferred appointment time.",
                                   properties={"preferred_time": {"type": "string", "description":
                                                                  "In the caller's words, e.g. 'Tuesday morning'"}},
                                   required=["preferred_time"],
                                   handler=self.save_preferred_time)

    def _correct_fn(self):
        return FlowsFunctionSchema(
            name="correct_detail", description="Fix one detail the caller says is wrong.",
            properties={"field": {"type": "string", "enum": ["name", "callback_number", "need", "address", "best_time", "preferred_time"]},
                        "value": {"type": "string"}},
            required=["field", "value"], handler=self.correct_detail)

    def _confirmed_fn(self):
        return FlowsFunctionSchema(name="details_confirmed", description="Caller confirmed the details are correct.",
                                   properties={}, required=[], handler=self.details_confirmed)


def summary_line(state: dict[str, Any]) -> str:
    """Deterministic fallback summary (the LLM summary is added by agents/notify in T5)."""
    c = state.get("caller", {})
    parts = [f"{c.get('name') or 'Unknown caller'}"]
    if c.get("need"):
        parts.append(f"needs: {c['need']}")
    if c.get("address"):
        parts.append(f"at {c['address']}")
    if c.get("preferred_time"):
        parts.append(f"prefers {c['preferred_time']}")
    elif c.get("best_time"):
        parts.append(f"best time {c['best_time']}")
    if c.get("unanswered_question"):
        parts.append(f"asked (not in our info): {c['unanswered_question']}")
    return "; ".join(parts)
