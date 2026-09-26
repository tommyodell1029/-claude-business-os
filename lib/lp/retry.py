"""Retry utilities for sync and async callables."""
import asyncio
import time
from typing import Any, Callable, Coroutine, TypeVar

T = TypeVar("T")


def retry(
    fn: Callable[[], T],
    *,
    attempts: int = 3,
    backoff: tuple[int | float, ...] = (1, 3, 9),
    exceptions: tuple[type[Exception], ...] = (Exception,),
    on_error: Callable[[Exception, int], None] | None = None,
    sleep: Callable[[int | float], None] = time.sleep,
) -> T:
    """Retry a synchronous function with exponential backoff.

    Args:
        fn: Callable that takes no arguments and returns a value.
        attempts: Number of attempts before giving up.
        backoff: Tuple of sleep durations (seconds). Uses last value if exhausted.
        exceptions: Tuple of exception types to catch and retry on.
        on_error: Optional callback(exception, attempt_number) called on each failure.
        sleep: Sleep function (default time.sleep).

    Returns:
        The return value of fn() on success.

    Raises:
        The last exception if all attempts are exhausted.
    """
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except exceptions as e:
            last_exc = e
            if on_error:
                on_error(e, attempt)
            if attempt < attempts:
                backoff_idx = min(attempt - 1, len(backoff) - 1)
                sleep(backoff[backoff_idx])

    raise last_exc


async def aretry(
    fn: Callable[[], Coroutine[Any, Any, T]],
    *,
    attempts: int = 3,
    backoff: tuple[int | float, ...] = (1, 3, 9),
    exceptions: tuple[type[Exception], ...] = (Exception,),
    on_error: Callable[[Exception, int], None] | None = None,
    sleep: Callable[[int | float], Coroutine[Any, Any, None]] = asyncio.sleep,
) -> T:
    """Retry an async function with exponential backoff.

    Args:
        fn: Async callable that takes no arguments and returns a value.
        attempts: Number of attempts before giving up.
        backoff: Tuple of sleep durations (seconds). Uses last value if exhausted.
        exceptions: Tuple of exception types to catch and retry on.
        on_error: Optional callback(exception, attempt_number) called on each failure.
        sleep: Async sleep function (default asyncio.sleep).

    Returns:
        The return value of fn() on success.

    Raises:
        The last exception if all attempts are exhausted.
    """
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            return await fn()
        except exceptions as e:
            last_exc = e
            if on_error:
                on_error(e, attempt)
            if attempt < attempts:
                backoff_idx = min(attempt - 1, len(backoff) - 1)
                await sleep(backoff[backoff_idx])

    raise last_exc
