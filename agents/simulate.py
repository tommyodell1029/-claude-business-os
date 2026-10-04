"""Text-mode call simulator: the real Pipecat pipeline + FlowManager, without phone audio.

- Scripted mode (no keys): the LLM's replies/function calls come from the script. Verifies flow wiring.
- Live mode (ANTHROPIC_API_KEY or LP_ANTHROPIC_API_KEY set, llm_script=None): the real `small` model answers typed caller lines.
  Used by the T4 tester's 8 scripted calls and for prompt tuning before a real phone test.

    uv run python -m agents.simulate demo "Hi, my water heater is leaking" "Ann" ...
"""
from __future__ import annotations

import asyncio
import sys
import time
from dataclasses import dataclass, field
from typing import Any

from loguru import logger
from pipecat.flows import FlowManager
from pipecat.frames.frames import (
    EndFrame, Frame, FunctionCallFromLLM, LLMFullResponseEndFrame, LLMFullResponseStartFrame,
    LLMMessagesAppendFrame, LLMTextFrame, TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.workers.runner import WorkerRunner

from lp.config import anthropic_api_key, model

from . import call_record
from .client_config import ClientConfig, load
from .flow import ReceptionistFlow, Transferer, init_state
from .guards import ToolTurnFilter


class ScriptedLLM(AnthropicLLMService):
    """Stands in for Claude: each inference consumes the next scripted action. No network calls.

    Actions: ("say", text) | ("call", name, args) | ("say_call", text, name, args). "say_call" is what the real
    model sometimes does: stream a sentence and a tool call in the same response. Frames are pushed in the
    same order as AnthropicLLMService (response start, text, function calls, response end).
    """

    def __init__(self):
        super().__init__(api_key="scripted-no-network", settings=AnthropicLLMService.Settings(model="scripted"))
        self.actions: list[tuple] = []
        self.inferences = 0
        self.seen: list[list[dict]] = []  # context messages at each inference (node task prompts included)

    async def _process_context(self, context: LLMContext):
        self.inferences += 1
        self.seen.append(list(context.get_messages()))
        if not self.actions:
            return
        act = self.actions.pop(0)
        await self.push_frame(LLMFullResponseStartFrame())
        if act[0] in ("say", "say_call"):
            await self.push_frame(LLMTextFrame(act[1]))
        if act[0] in ("call", "say_call"):
            name, args = act[-2], act[-1]
            await self.run_function_calls([FunctionCallFromLLM(function_name=name, tool_call_id=f"t{self.inferences}",
                                                               arguments=args, context=context)])
        await self.push_frame(LLMFullResponseEndFrame())


class SpokenCollector(FrameProcessor):
    """Records what the agent would have said aloud."""

    def __init__(self):
        super().__init__()
        self.spoken: list[str] = []
        self._buf: list[str] = []
        self.ended = asyncio.Event()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TTSSpeakFrame):
            self.spoken.append(frame.text)
        elif isinstance(frame, LLMTextFrame):
            self._buf.append(frame.text)
        elif isinstance(frame, LLMFullResponseEndFrame) and self._buf:
            self.spoken.append("".join(self._buf))
            self._buf = []
        elif isinstance(frame, EndFrame):
            self.ended.set()
        await self.push_frame(frame, direction)


@dataclass
class SimResult:
    spoken: list[str]
    state: dict[str, Any]
    record: dict[str, Any]
    ended: bool
    latencies_ms: list[float] = field(default_factory=list)
    prompts: list[list[dict]] = field(default_factory=list)  # scripted mode: context seen at each inference


async def simulate(cfg: ClientConfig, turns: list[dict], *, transferer: Transferer | None = None,
                   live: bool = False, settle: float = 0.25, turn_timeout: float = 20.0) -> SimResult:
    """turns: [{"caller": str|None, "llm": [("say", text) | ("call", name, args), ...]}]. `llm` ignored when live."""
    flow = ReceptionistFlow(cfg, transferer)
    if live:
        api_key = anthropic_api_key()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY (or LP_ANTHROPIC_API_KEY) is not set")
        llm = AnthropicLLMService(api_key=api_key,
                                  settings=AnthropicLLMService.Settings(model=model("small", "voice")))
    else:
        llm = ScriptedLLM()
    context = LLMContext()
    aggregators = LLMContextAggregatorPair(context)
    collector = SpokenCollector()
    worker = PipelineWorker(Pipeline([aggregators.user(), llm, ToolTurnFilter(), collector, aggregators.assistant()]),
                            params=PipelineParams(), cancel_on_idle_timeout=False)
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    fm = FlowManager(llm=llm, context_aggregator=aggregators, worker=worker, global_functions=flow.global_functions())
    init_state(fm.state, cfg)
    latencies: list[float] = []
    started = time.monotonic()

    async def drive():
        await asyncio.sleep(0.2)
        await fm.initialize(flow.greeting_node())
        await asyncio.sleep(settle)
        for turn in turns:
            if collector.ended.is_set():
                break
            if not live:
                llm.actions.extend(turn.get("llm", []))
            if turn.get("caller"):
                before = len(collector.spoken)
                t0 = time.monotonic()
                await worker.queue_frames([LLMMessagesAppendFrame([{"role": "user", "content": turn["caller"]}], run_llm=True)])
                if live:
                    deadline = t0 + turn_timeout
                    while len(collector.spoken) == before and time.monotonic() < deadline and not collector.ended.is_set():
                        await asyncio.sleep(0.05)
                    latencies.append((time.monotonic() - t0) * 1000)
            while not live and llm.actions and not collector.ended.is_set():
                await asyncio.sleep(0.05)
            await asyncio.sleep(settle if not live else 1.5)
        if not collector.ended.is_set():
            await worker.queue_frames([EndFrame()])

    await asyncio.gather(runner.run(), drive())
    record = call_record.build(fm.state, call_sid="SIMULATED", caller_id=None, messages=context.get_messages(),
                               duration_sec=time.monotonic() - started, est_cost=None)
    return SimResult(collector.spoken, dict(fm.state), record, collector.ended.is_set(), latencies,
                     getattr(llm, "seen", []))


def main(argv: list[str]) -> None:
    """Live text simulation: python -m agents.simulate <slug> "caller line" "caller line" ..."""
    logger.remove()
    logger.add(sys.stderr, level="WARNING")
    slug, lines = argv[0], argv[1:]
    res = asyncio.run(simulate(load(slug), [{"caller": line} for line in lines], live=True))
    for s in res.spoken:
        print(f"AGENT: {s}")
    print(f"\nstate: intent={res.state.get('intent')} urgency={res.state.get('urgency')} end={res.state.get('end_reason')}")
    if res.latencies_ms:
        print("LLM text latency ms (no STT/TTS): " + ", ".join(f"{x:.0f}" for x in res.latencies_ms))


if __name__ == "__main__":
    main(sys.argv[1:])
