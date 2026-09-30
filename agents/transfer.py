"""Real Twilio call transfer: redirect the live call via Twilio's REST API.

On transfer_to_human, PATCHes the live Twilio call to <Dial> the handoff number
(agents/flow.py ReceptionistFlow._do_transfer calls Transferer.transfer). Twilio
POSTs the outcome to `action_url`; if nobody answered, that webhook reconnects
the caller to this same bot in "urgent_message" mode (bot.py start_mode
handling) instead of just dropping the call.

TRANSFER_ACTION_URL and TRANSFER_STREAM_URL point at the deployed bot's public
endpoints (T4 deploy step); both are required for TwilioTransferer to be used
at all — see make_transferer() in bot.py.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import Response
from loguru import logger
from pipecat.flows import FlowManager
from twilio.request_validator import RequestValidator
from twilio.rest import Client
from twilio.twiml.voice_response import Connect, Dial, Stream, VoiceResponse

from lp.text import redact

DIAL_TIMEOUT_SECS = 20


def build_transfer_twiml(handoff_number: str, action_url: str) -> str:
    """TwiML that dials the handoff number; Twilio POSTs the result to `action_url`."""
    resp = VoiceResponse()
    dial = Dial(timeout=DIAL_TIMEOUT_SECS, action=action_url, method="POST")
    dial.number(handoff_number)
    resp.append(dial)
    return str(resp)


def build_reconnect_twiml(stream_url: str, *, to_number: str | None = None, from_number: str | None = None) -> str:
    """TwiML reconnecting an unanswered transfer to the bot's stream in urgent_message mode."""
    resp = VoiceResponse()
    connect = Connect()
    stream = Stream(url=stream_url)
    stream.parameter(name="mode", value="urgent_message")
    if to_number:
        stream.parameter(name="to_number", value=to_number)
    if from_number:
        stream.parameter(name="from_number", value=from_number)
    connect.append(stream)
    resp.append(connect)
    return str(resp)


def build_hangup_twiml() -> str:
    resp = VoiceResponse()
    resp.hangup()
    return str(resp)


def dial_action_twiml(dial_call_status: str, stream_url: str, *, to_number: str | None = None,
                      from_number: str | None = None) -> str:
    """Decide the response to Twilio's <Dial action> callback from `DialCallStatus`.

    Anything but "completed" (no-answer, busy, failed, canceled) means nobody
    picked up, so reconnect the caller to the bot instead of just hanging up.
    """
    if dial_call_status == "completed":
        return build_hangup_twiml()
    return build_reconnect_twiml(stream_url, to_number=to_number, from_number=from_number)


def verify_twilio_signature(auth_token: str, url: str, params: dict, signature: str | None) -> bool:
    """Verify an inbound request actually came from Twilio (X-Twilio-Signature)."""
    if not signature:
        return False
    return RequestValidator(auth_token).validate(url, params, signature)


class TwilioTransferer:
    """Redirects a live Twilio call to a human via the REST API (flow.py Transferer protocol)."""

    def __init__(self, account_sid: str, auth_token: str, action_url: str):
        self._client = Client(account_sid, auth_token)
        self._action_url = action_url

    async def transfer(self, flow_manager: FlowManager, to_number: str) -> str:
        call_sid = flow_manager.state.get("call_sid")
        if not call_sid or not to_number:
            return "unavailable"
        twiml = build_transfer_twiml(to_number, self._action_url)
        try:
            await asyncio.to_thread(self._client.calls(call_sid).update, twiml=twiml)
        except Exception as e:
            logger.error(redact(f"twilio transfer failed call_sid={call_sid}: {e}"))
            return "unavailable"
        return "initiated"


def make_transfer_router(auth_token: str, stream_url: str) -> APIRouter:
    """FastAPI router for Twilio's <Dial action> webhook. Mount on the bot's public app."""
    router = APIRouter()

    @router.post("/twilio/transfer-status")
    async def transfer_status(request: Request, x_twilio_signature: str | None = Header(default=None)):
        form = await request.form()
        params = dict(form)
        if not verify_twilio_signature(auth_token, str(request.url), params, x_twilio_signature):
            raise HTTPException(status_code=403, detail="invalid Twilio signature")
        twiml = dial_action_twiml(params.get("DialCallStatus", ""), stream_url,
                                  to_number=params.get("Called"), from_number=params.get("Caller"))
        return Response(content=twiml, media_type="application/xml")

    return router
