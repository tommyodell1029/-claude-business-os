"""TwiML generation, Twilio signature verification, and TwilioTransferer (no real Twilio calls)."""
import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from twilio.request_validator import RequestValidator  # noqa: E402

from agents.transfer import (  # noqa: E402
    TwilioTransferer,
    build_hangup_twiml,
    build_reconnect_twiml,
    build_transfer_twiml,
    dial_action_twiml,
    make_transfer_router,
    verify_twilio_signature,
)

AUTH_TOKEN = "test_auth_token"
ACTION_URL = "https://bot.example.com/twilio/transfer-status"
STREAM_URL = "wss://bot.example.com/ws"


class FakeCallResource:
    def __init__(self, log: list, sid: str, *, raises: bool = False):
        self._log = log
        self._sid = sid
        self._raises = raises

    def update(self, twiml: str):
        if self._raises:
            raise RuntimeError("twilio api down")
        self._log.append((self._sid, twiml))


class FakeTwilioClient:
    def __init__(self, *, raises: bool = False):
        self.updates: list = []
        self._raises = raises

    def calls(self, sid: str) -> FakeCallResource:
        return FakeCallResource(self.updates, sid, raises=self._raises)


class TestTwiMLBuilders(unittest.TestCase):
    def test_transfer_twiml_dials_handoff_with_action_and_timeout(self):
        twiml = build_transfer_twiml("+19045551234", ACTION_URL)
        self.assertIn('<Dial action="https://bot.example.com/twilio/transfer-status"', twiml)
        self.assertIn('method="POST"', twiml)
        self.assertIn('timeout="20"', twiml)
        self.assertIn("<Number>+19045551234</Number>", twiml)

    def test_reconnect_twiml_sets_urgent_mode_parameter(self):
        twiml = build_reconnect_twiml(STREAM_URL)
        self.assertIn(f'<Stream url="{STREAM_URL}">', twiml)
        self.assertIn('<Parameter name="mode" value="urgent_message"', twiml)

    def test_reconnect_twiml_passes_through_call_numbers(self):
        twiml = build_reconnect_twiml(STREAM_URL, to_number="+19045550000", from_number="+19045551111")
        self.assertIn('<Parameter name="to_number" value="+19045550000"', twiml)
        self.assertIn('<Parameter name="from_number" value="+19045551111"', twiml)

    def test_reconnect_twiml_routes_to_pipecat_cloud_agent(self):
        twiml = dial_action_twiml("no-answer", STREAM_URL, service_host="receptionist.lp-org")
        self.assertIn('<Parameter name="_pipecatCloudServiceHost" value="receptionist.lp-org"', twiml)
        self.assertNotIn("_pipecatCloudServiceHost", build_reconnect_twiml(STREAM_URL))

    def test_hangup_twiml(self):
        self.assertIn("<Hangup", build_hangup_twiml())

    def test_dial_action_hangs_up_when_answered(self):
        twiml = dial_action_twiml("completed", STREAM_URL)
        self.assertIn("<Hangup", twiml)
        self.assertNotIn("<Stream", twiml)

    def test_dial_action_reconnects_on_no_answer(self):
        for status in ("no-answer", "busy", "failed", "canceled"):
            with self.subTest(status=status):
                twiml = dial_action_twiml(status, STREAM_URL)
                self.assertIn("<Stream", twiml)
                self.assertIn('value="urgent_message"', twiml)


class TestSignatureVerification(unittest.TestCase):
    def test_valid_signature_accepted(self):
        params = {"DialCallStatus": "completed", "CallSid": "CA123"}
        sig = RequestValidator(AUTH_TOKEN).compute_signature(ACTION_URL, params)
        self.assertTrue(verify_twilio_signature(AUTH_TOKEN, ACTION_URL, params, sig))

    def test_tampered_params_rejected(self):
        params = {"DialCallStatus": "completed", "CallSid": "CA123"}
        sig = RequestValidator(AUTH_TOKEN).compute_signature(ACTION_URL, params)
        tampered = {"DialCallStatus": "no-answer", "CallSid": "CA123"}
        self.assertFalse(verify_twilio_signature(AUTH_TOKEN, ACTION_URL, tampered, sig))

    def test_wrong_token_rejected(self):
        params = {"DialCallStatus": "completed"}
        sig = RequestValidator(AUTH_TOKEN).compute_signature(ACTION_URL, params)
        self.assertFalse(verify_twilio_signature("wrong_token", ACTION_URL, params, sig))

    def test_missing_signature_rejected(self):
        self.assertFalse(verify_twilio_signature(AUTH_TOKEN, ACTION_URL, {}, None))


class TestTwilioTransferer(unittest.TestCase):
    def _transferer(self, *, raises: bool = False) -> TwilioTransferer:
        t = TwilioTransferer("AC_test_sid", AUTH_TOKEN, ACTION_URL)
        t._client = FakeTwilioClient(raises=raises)
        return t

    def test_initiates_transfer_when_call_sid_and_number_present(self):
        transferer = self._transferer()
        fm = SimpleNamespace(state={"call_sid": "CA123"})
        result = asyncio.run(transferer.transfer(fm, "+19045551234"))
        self.assertEqual(result, "initiated")
        self.assertEqual(transferer._client.updates[0][0], "CA123")
        self.assertIn("+19045551234", transferer._client.updates[0][1])

    def test_unavailable_when_no_call_sid(self):
        transferer = self._transferer()
        fm = SimpleNamespace(state={})
        result = asyncio.run(transferer.transfer(fm, "+19045551234"))
        self.assertEqual(result, "unavailable")
        self.assertEqual(transferer._client.updates, [])

    def test_unavailable_when_no_handoff_number(self):
        transferer = self._transferer()
        fm = SimpleNamespace(state={"call_sid": "CA123"})
        result = asyncio.run(transferer.transfer(fm, ""))
        self.assertEqual(result, "unavailable")

    def test_unavailable_when_twilio_api_fails(self):
        transferer = self._transferer(raises=True)
        fm = SimpleNamespace(state={"call_sid": "CA123"})
        result = asyncio.run(transferer.transfer(fm, "+19045551234"))
        self.assertEqual(result, "unavailable")


class TestTransferRouter(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(make_transfer_router(AUTH_TOKEN, STREAM_URL))
        self.client = TestClient(app, base_url="https://bot.example.com")

    def _signed_post(self, params: dict):
        url = "https://bot.example.com/twilio/transfer-status"
        sig = RequestValidator(AUTH_TOKEN).compute_signature(url, params)
        return self.client.post("/twilio/transfer-status", data=params, headers={"X-Twilio-Signature": sig})

    def test_rejects_missing_signature(self):
        resp = self.client.post("/twilio/transfer-status", data={"DialCallStatus": "completed"})
        self.assertEqual(resp.status_code, 403)

    def test_rejects_invalid_signature(self):
        resp = self.client.post("/twilio/transfer-status", data={"DialCallStatus": "completed"},
                                headers={"X-Twilio-Signature": "bogus"})
        self.assertEqual(resp.status_code, 403)

    def test_completed_call_hangs_up(self):
        resp = self._signed_post({"DialCallStatus": "completed"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("<Hangup", resp.text)

    def test_no_answer_reconnects_with_call_numbers(self):
        resp = self._signed_post({"DialCallStatus": "no-answer", "Called": "+19045550000",
                                  "Caller": "+19045551111"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("<Stream", resp.text)
        self.assertIn('value="urgent_message"', resp.text)
        self.assertIn('value="+19045550000"', resp.text)
        self.assertIn('value="+19045551111"', resp.text)


if __name__ == "__main__":
    unittest.main()
