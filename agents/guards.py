"""Safety and cost guards: hard max call length, silence handling, emergency keywords, cost estimate."""
from __future__ import annotations

import asyncio
from pathlib import Path

import yaml
from loguru import logger
from pipecat.flows import FlowManager
from pipecat.frames.frames import (
    CancelFrame, EndFrame, Frame, FunctionCallsStartedFrame, InterruptionFrame,
    LLMFullResponseEndFrame, LLMFullResponseStartFrame, LLMTextFrame, TranscriptionFrame, TTSSpeakFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from . import ROOT
from .flow import ReceptionistFlow, matches_emergency

WRAP_UP_LINE = ("I'm sorry, I need to wrap up this call now. I've saved what you told me, "
                "and the team will follow up. Goodbye.")
STILL_THERE_LINE = "Are you still there?"
SILENCE_END_LINE = "I haven't heard anything, so I'll end the call now. Please call back anytime. Goodbye."
ES_GUARDS = {
    WRAP_UP_LINE: "Lo siento, tengo que terminar la llamada. Guardé lo que me dijo y el equipo se comunicará con usted. Adiós.",
    STILL_THERE_LINE: "¿Sigue ahí?",
    SILENCE_END_LINE: "No he escuchado nada, así que terminaré la llamada. Puede volver a llamar cuando guste. Adiós.",
}


def _say(flow: ReceptionistFlow, text: str) -> str:
    return f"{text} {ES_GUARDS[text]}" if flow.cfg.bilingual else text


def estimate_cost(duration_sec: float, rates_file: Path = ROOT / "config" / "voice.yaml") -> float | None:
    """Sum of per-minute rates x minutes. None if any rate is unset (never guess)."""
    with open(rates_file) as f:
        rates = (yaml.safe_load(f) or {}).get("cost_per_minute") or {}
    if not rates or any(v is None for v in rates.values()):
        return None
    return round(sum(float(v) for v in rates.values()) * max(duration_sec, 0) / 60.0, 4)


class CallTimer:
    """Ends the call politely at max_call_minutes; hard-cancels 30s later if still running."""

    def __init__(self, flow: ReceptionistFlow, fm: FlowManager, cancel, max_minutes: int):
        self._flow, self._fm, self._cancel, self._limit = flow, fm, cancel, max_minutes * 60
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        try:
            await asyncio.sleep(self._limit)
            logger.info("max call length reached")
            self._fm.state["end_reason"] = "max_duration"
            await self._fm.set_node_from_config(self._flow.end_node(_say(self._flow, WRAP_UP_LINE)))
            await asyncio.sleep(30)
            await self._cancel()
        except asyncio.CancelledError:
            pass


class SilenceHandler:
    """First idle timeout: ask if the caller is still there. Second: end the call."""

    def __init__(self, flow: ReceptionistFlow, fm: FlowManager, queue_frames):
        self._flow, self._fm, self._queue = flow, fm, queue_frames
        self.count = 0

    async def on_idle(self, *_):
        self.count += 1
        if self.count == 1:
            await self._queue([TTSSpeakFrame(_say(self._flow, STILL_THERE_LINE))])
        else:
            self._fm.state["end_reason"] = "silence"
            await self._fm.set_node_from_config(self._flow.end_node(_say(self._flow, SILENCE_END_LINE)))

    def reset(self, *_):
        self.count = 0


class EmergencyWatcher(FrameProcessor):
    """Deterministic backup to the LLM: a configured emergency keyword in a final transcript forces a transfer."""

    def __init__(self, flow: ReceptionistFlow, keywords: list[str]):
        super().__init__()
        self._flow, self._keywords = flow, keywords
        self.fm: FlowManager | None = None

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and self.fm is not None:
            hit = matches_emergency(frame.text, self._keywords)
            if hit and not self.fm.state.get("transfer_attempted"):
                logger.info(f"emergency keyword heard: {hit!r}")
                result, node = await self._flow.transfer_to_human({"reason": "emergency", "details": frame.text}, self.fm)
                if node is not None:
                    asyncio.create_task(self.fm.set_node_from_config(node))
        await self.push_frame(frame, direction)


class ToolTurnFilter(FrameProcessor):
    """Sits between the LLM and TTS. Holds the model's text until its response ends; if that same response
    also called a function, the text is dropped.

    Why: after any function call the flow always speaks next (the new node's reply, its fixed line, or the
    model's follow-up to the result). Text streamed before the tool call ("Sure, I can help with that",
    "You're welcome, goodbye!") would otherwise be an extra unprompted line or a second goodbye.
    Cost: TTS starts at the end of each (short) model reply instead of after its first sentence.
    """

    def __init__(self):
        super().__init__()
        self._buf: list[LLMTextFrame] = []
        self._in_response = False
        self._tool_called = False
        self.dropped: list[str] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if direction != FrameDirection.DOWNSTREAM:
            await self.push_frame(frame, direction)
            return
        # FunctionCallsStartedFrame is a system frame: it can arrive before this response's start frame, so the
        # flag is only cleared once a response ends, never when one starts.
        if isinstance(frame, LLMFullResponseStartFrame):
            self._buf, self._in_response = [], True
        elif isinstance(frame, FunctionCallsStartedFrame):
            self._tool_called = True
        elif isinstance(frame, LLMTextFrame) and self._in_response:
            self._buf.append(frame)
            return
        elif isinstance(frame, LLMFullResponseEndFrame):
            buf, tool_called = self._buf, self._tool_called
            self._buf, self._in_response, self._tool_called = [], False, False
            if tool_called and buf:
                self.dropped.append("".join(f.text for f in buf))
                logger.debug(f"dropped pre-tool text: {self.dropped[-1]!r}")
            else:
                for f in buf:
                    await self.push_frame(f, direction)
        elif isinstance(frame, (InterruptionFrame, EndFrame, CancelFrame)):
            self._buf, self._in_response, self._tool_called = [], False, False
        await self.push_frame(frame, direction)
