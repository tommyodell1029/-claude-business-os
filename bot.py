"""Pipecat Cloud entrypoint. The base image runs bot() from ./bot.py; the real bot lives in agents/bot.py."""
from agents.bot import bot  # noqa: F401
