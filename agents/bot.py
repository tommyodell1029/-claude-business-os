"""LaunchPad Local receptionist bot: Twilio -> Deepgram STT -> Anthropic (small) -> ElevenLabs/Cartesia TTS.

Run locally:  uv run python -m agents.bot -t twilio   (see agents/README.md)
The client is chosen from the dialed number (TwiML <Parameter name="to_number">), else DEFAULT_CLIENT.
"""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.flows import FlowManager
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams
from pipecat.workers.runner import WorkerRunner

from lp.config import anthropic_api_key, model
from lp.text import redact

from . import call_record
from .client_config import ClientConfig, load, slug_for_number
from .flow import NoTransfer, ReceptionistFlow, Transferer, init_state
from .guards import CallTimer, EmergencyWatcher, SilenceHandler, estimate_cost
from .transfer import TwilioTransferer

load_dotenv(override=True)


def _require(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"{name} is not set")
    return v


def make_transferer() -> Transferer:
    """Real Twilio transfer when the account creds and public action URL are set, else NoTransfer."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    action_url = os.getenv("TRANSFER_ACTION_URL")
    if account_sid and auth_token and action_url:
        return TwilioTransferer(account_sid, auth_token, action_url)
    return NoTransfer()


def stt_kwargs(cfg: ClientConfig) -> dict:
    """Bilingual clients: Deepgram nova-3 multilingual (English/Spanish code-switching)."""
    if cfg.bilingual:
        return {"settings": DeepgramSTTService.Settings(model="nova-3", language="multi")}
    return {}


def make_tts(cfg: ClientConfig):
    if cfg.tts_provider == "cartesia":
        from pipecat.services.cartesia.tts import CartesiaTTSService
        return CartesiaTTSService(api_key=_require("CARTESIA_API_KEY"),
                                  settings=CartesiaTTSService.Settings(voice=cfg.voice_id))
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
    return ElevenLabsTTSService(api_key=_require("ELEVENLABS_API_KEY"),
                                settings=ElevenLabsTTSService.Settings(voice=cfg.voice_id))


async def run_bot(transport: BaseTransport, cfg: ClientConfig, *, call_sid: str | None, caller_id: str | None,
                  handle_sigint: bool, start_mode: str | None = None) -> None:
    started = time.monotonic()
    flow = ReceptionistFlow(cfg, make_transferer())

    stt = DeepgramSTTService(api_key=_require("DEEPGRAM_API_KEY"), **stt_kwargs(cfg))
    api_key = anthropic_api_key()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY (or LP_ANTHROPIC_API_KEY) is not set")
    llm = AnthropicLLMService(api_key=api_key,
                              settings=AnthropicLLMService.Settings(model=model("small", "voice")))
    tts = make_tts(cfg)

    context = LLMContext()
    aggregators = LLMContextAggregatorPair(
        context, user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer(),
                                                     user_idle_timeout=cfg.silence_timeout_secs))
    user_agg, assistant_agg = aggregators.user(), aggregators.assistant()
    watcher = EmergencyWatcher(flow, cfg.emergency_keywords)

    pipeline = Pipeline([transport.input(), stt, watcher, user_agg, llm, tts, transport.output(), assistant_agg])
    worker = PipelineWorker(pipeline, params=PipelineParams(
        enable_metrics=True, enable_usage_metrics=True, audio_in_sample_rate=8000, audio_out_sample_rate=8000))
    runner = WorkerRunner(handle_sigint=handle_sigint)
    await runner.add_workers(worker)

    fm = FlowManager(llm=llm, context_aggregator=aggregators, worker=worker, transport=transport,
                     global_functions=flow.global_functions())
    init_state(fm.state, cfg)
    fm.state["call_sid"] = call_sid
    watcher.fm = fm
    timer = CallTimer(flow, fm, runner.cancel, cfg.max_call_minutes)
    silence = SilenceHandler(flow, fm, worker.queue_frames)
    user_agg.event_handler("on_user_turn_idle")(silence.on_idle)
    user_agg.event_handler("on_user_turn_started")(silence.reset)

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, client):
        logger.info(f"call connected client={cfg.slug} mode={start_mode}")
        timer.start()
        if start_mode == "urgent_message":  # reconnected after an unanswered transfer (T4)
            fm.state.update(urgency="urgent", transfer_attempted=True)
            await fm.initialize(flow.collect_node(urgent=True))
        else:
            await fm.initialize(flow.greeting_node())

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, client):
        timer.stop()
        duration = time.monotonic() - started
        record = call_record.build(fm.state, call_sid=call_sid, caller_id=caller_id,
                                   messages=context.get_messages(), duration_sec=duration,
                                   est_cost=estimate_cost(duration))
        try:
            path = call_record.write_local(record)  # T5: replaced by agents.notify.handle(record)
            logger.info(f"call record saved {path.name} duration={record['duration_sec']}s est_cost={record['est_cost']}")
        except Exception as e:  # never crash teardown on a record failure
            logger.error(redact(f"failed to save call record: {e}"))
        await runner.cancel()

    await runner.run()


async def bot(runner_args: RunnerArguments):
    transport = await create_transport(runner_args, {
        "twilio": lambda: FastAPIWebsocketParams(audio_in_enabled=True, audio_out_enabled=True),
    })
    cd = runner_args.call_data
    body = (cd.get("body") if cd else None) or {}
    slug = slug_for_number(cd.to_number if cd else None) or os.getenv("DEFAULT_CLIENT", "demo")
    cfg = load(slug)
    await run_bot(transport, cfg, call_sid=cd.call_id if cd else None, caller_id=cd.from_number if cd else None,
                  handle_sigint=runner_args.handle_sigint, start_mode=body.get("mode"))


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
