"""Tests for lib.lp utilities."""
import asyncio
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))

from lp.text import domain_of, norm_email, norm_phone, redact
from lp.retry import aretry, retry


class TestDomainOf(unittest.TestCase):
    """Tests for domain_of()."""

    def test_full_url_with_www(self):
        self.assertEqual(domain_of("https://www.Foo.com/a?b"), "foo.com")

    def test_none(self):
        self.assertIsNone(domain_of(None))

    def test_no_dot(self):
        self.assertIsNone(domain_of("localhost"))

    def test_empty_string(self):
        self.assertIsNone(domain_of(""))

    def test_http_url(self):
        self.assertEqual(domain_of("http://example.com"), "example.com")

    def test_no_protocol(self):
        self.assertEqual(domain_of("example.com"), "example.com")

    def test_with_path_and_query(self):
        self.assertEqual(domain_of("https://sub.example.co.uk/path?q=1"), "sub.example.co.uk")


class TestNormPhone(unittest.TestCase):
    """Tests for norm_phone()."""

    def test_formatted_10_digits(self):
        self.assertEqual(norm_phone("(904) 555-1234"), "+19045551234")

    def test_with_1_prefix(self):
        self.assertEqual(norm_phone("1-904-555-1234"), "+19045551234")

    def test_only_7_digits(self):
        self.assertIsNone(norm_phone("555-1234"))

    def test_area_code_starts_with_1(self):
        self.assertIsNone(norm_phone("(104) 555-1234"))

    def test_area_code_starts_with_0(self):
        self.assertIsNone(norm_phone("(004) 555-1234"))

    def test_exchange_code_starts_with_1(self):
        self.assertIsNone(norm_phone("(904) 155-1234"))

    def test_exchange_code_starts_with_0(self):
        self.assertIsNone(norm_phone("(904) 055-1234"))

    def test_none(self):
        self.assertIsNone(norm_phone(None))

    def test_empty_string(self):
        self.assertIsNone(norm_phone(""))

    def test_plain_10_digits(self):
        self.assertEqual(norm_phone("9045551234"), "+19045551234")

    def test_11_digits_no_1_prefix(self):
        self.assertIsNone(norm_phone("29045551234"))


class TestNormEmail(unittest.TestCase):
    """Tests for norm_email()."""

    def test_with_spaces_and_uppercase(self):
        self.assertEqual(norm_email(" A@B.co "), "a@b.co")

    def test_invalid_no_at(self):
        self.assertIsNone(norm_email("nope"))

    def test_none(self):
        self.assertIsNone(norm_email(None))

    def test_empty_string(self):
        self.assertIsNone(norm_email(""))

    def test_valid_email(self):
        self.assertEqual(norm_email("test@example.com"), "test@example.com")

    def test_with_plus_addressing(self):
        self.assertEqual(norm_email("user+tag@example.com"), "user+tag@example.com")


class TestRedact(unittest.TestCase):
    """Tests for redact()."""

    def test_redact_env_var(self):
        try:
            os.environ["FAKE_API_KEY"] = "supersecretvalue123"
            text = "key supersecretvalue123 and data"
            redacted = redact(text)
            self.assertNotIn("supersecretvalue123", redacted)
            self.assertIn("[REDACTED]", redacted)
        finally:
            del os.environ["FAKE_API_KEY"]

    def test_redact_openai_pattern(self):
        text = "key sk-abcdefghijklmnopqrstuv and data"
        redacted = redact(text)
        self.assertNotIn("sk-abcdefghijklmnopqrstuv", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_redact_password(self):
        text = "password=hunter22 and data"
        redacted = redact(text)
        self.assertNotIn("hunter22", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_no_redact_short_env(self):
        try:
            os.environ["FAKE_KEY"] = "short"
            text = "key short and data"
            redacted = redact(text)
            # Should still redact because it matches the pattern
            # Actually, let me check: short is 5 chars, < 6, so should NOT redact
            self.assertIn("short", redacted)
        finally:
            del os.environ["FAKE_KEY"]

    def test_redact_none(self):
        self.assertIsNone(redact(None))


class TestRetry(unittest.TestCase):
    """Tests for retry()."""

    def test_succeeds_immediately(self):
        def fn():
            return "success"

        result = retry(fn, attempts=1, sleep=lambda s: None)
        self.assertEqual(result, "success")

    def test_succeeds_on_third_attempt(self):
        state = {"attempts": 0}

        def fn():
            state["attempts"] += 1
            if state["attempts"] < 3:
                raise ValueError("fail")
            return "success"

        errors = []

        def on_error(exc, attempt):
            errors.append((exc, attempt))

        result = retry(
            fn, attempts=3, backoff=(0.001, 0.001), sleep=lambda s: None, on_error=on_error
        )
        self.assertEqual(result, "success")
        self.assertEqual(state["attempts"], 3)
        self.assertEqual(len(errors), 2)
        self.assertEqual(errors[0][1], 1)
        self.assertEqual(errors[1][1], 2)

    def test_raises_after_exhausted(self):
        def fn():
            raise ValueError("fail")

        with self.assertRaises(ValueError):
            retry(fn, attempts=2, sleep=lambda s: None)

    def test_does_not_retry_other_exceptions(self):
        attempts = [0]

        def fn():
            attempts[0] += 1
            raise RuntimeError("fail")

        with self.assertRaises(RuntimeError):
            retry(fn, attempts=3, exceptions=(ValueError,), sleep=lambda s: None)

        self.assertEqual(attempts[0], 1)

    def test_respects_backoff(self):
        state = {"attempts": 0, "sleeps": []}

        def fn():
            state["attempts"] += 1
            if state["attempts"] < 3:
                raise ValueError("fail")
            return "success"

        def mock_sleep(duration):
            state["sleeps"].append(duration)

        result = retry(fn, attempts=3, backoff=(1, 2), sleep=mock_sleep)
        self.assertEqual(result, "success")
        self.assertEqual(state["sleeps"], [1, 2])


class TestARetry(unittest.TestCase):
    """Tests for aretry()."""

    def test_succeeds_immediately(self):
        async def fn():
            return "success"

        async def run():
            return await aretry(fn, attempts=1, sleep=lambda s: None)

        result = asyncio.run(run())
        self.assertEqual(result, "success")

    def test_succeeds_on_third_attempt(self):
        state = {"attempts": 0}

        async def fn():
            state["attempts"] += 1
            if state["attempts"] < 3:
                raise ValueError("fail")
            return "success"

        errors = []

        def on_error(exc, attempt):
            errors.append((exc, attempt))

        async def mock_sleep(duration):
            pass

        async def run():
            return await aretry(
                fn,
                attempts=3,
                backoff=(0.001, 0.001),
                sleep=mock_sleep,
                on_error=on_error,
            )

        result = asyncio.run(run())
        self.assertEqual(result, "success")
        self.assertEqual(state["attempts"], 3)
        self.assertEqual(len(errors), 2)
        self.assertEqual(errors[0][1], 1)
        self.assertEqual(errors[1][1], 2)

    def test_raises_after_exhausted(self):
        async def fn():
            raise ValueError("fail")

        async def mock_sleep(duration):
            pass

        async def run():
            return await aretry(fn, attempts=2, sleep=mock_sleep)

        with self.assertRaises(ValueError):
            asyncio.run(run())

    def test_does_not_retry_other_exceptions(self):
        attempts = [0]

        async def fn():
            attempts[0] += 1
            raise RuntimeError("fail")

        async def mock_sleep(duration):
            pass

        async def run():
            return await aretry(fn, attempts=3, exceptions=(ValueError,), sleep=mock_sleep)

        with self.assertRaises(RuntimeError):
            asyncio.run(run())

        self.assertEqual(attempts[0], 1)




class TestModelsConfig(unittest.TestCase):
    def test_small_for_voice(self):
        from lp.config import model
        self.assertTrue(model("small", "voice").startswith("claude-haiku"))

    def test_audit_model_blocked_outside_audit(self):
        from lp.config import model
        for comp in ("voice", "notify", "leadgen"):
            with self.assertRaises(PermissionError):
                model("audit", comp)
        self.assertTrue(model("audit", "audit"))

    def test_anthropic_key_fallback(self):
        from unittest import mock
        from lp.config import anthropic_api_key
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "", "LP_ANTHROPIC_API_KEY": ""}):
            self.assertIsNone(anthropic_api_key())
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "", "LP_ANTHROPIC_API_KEY": " sk-lp "}):
            self.assertEqual(anthropic_api_key(), "sk-lp")
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-main", "LP_ANTHROPIC_API_KEY": "sk-lp"}):
            self.assertEqual(anthropic_api_key(), "sk-main")

    def test_redact_supabase_and_resend(self):
        from lp.text import redact
        s = redact("k=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop r=re_ABCDEFGHIJKLMNOPQRSTUV")
        self.assertNotIn("eyJyb2xl", s)
        self.assertNotIn("re_ABCDEFGH", s)


if __name__ == "__main__":
    unittest.main()
