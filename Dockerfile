# Pipecat Cloud image for the voice agent (T4). Built by `pipecat cloud deploy` (Pipecat Cloud Build).
# Base image pinned; the base runs bot() from ./bot.py and owns /app, so nothing is copied there.
FROM dailyco/pipecat-base:0.2.0-py3.11

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Exact pins from uv.lock only.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

# Only what a live call needs. No .env, tests, leadgen, site or legacy code in the image.
COPY ./bot.py bot.py
COPY ./agents agents
COPY ./lib lib
COPY ./clients clients
COPY ./config config
