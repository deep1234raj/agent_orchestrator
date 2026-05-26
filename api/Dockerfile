# API service — FastAPI + LangGraph
#
# Uses uv for fast dependency resolution. Multi-stage isn't worth it for
# dev (we want the toolchain present for hot reload); a separate prod
# Dockerfile can do that later.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# System deps: psycopg needs libpq, healthcheck needs wget.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Install Python deps first for better layer caching.
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen || uv sync

# App code is bind-mounted by docker-compose for hot reload, but we COPY
# it too so the image is self-sufficient when run without a mount.
COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
