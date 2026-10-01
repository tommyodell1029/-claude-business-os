"""Safety and cost guards: hard max call length, silence handling, emergency keywords, cost estimate."""
from __future__ import annotations

import asyncio
from pathlib import Path

import yaml
from loguru import logger
from pipecat.flows import FlowManager
from pipecat.frames.frames import Frame, TranscriptionFrame, TTSSpeakFrame
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
