"""FastAPI app factory.

Wires everything together:
  - Configure logging.
  - Import every tool module (registers them).
  - Mount routers (REST + WS).
  - Install CORS.
  - Install exception handlers.
  - Start the worker and scheduler on lifespan startup.
  - Stop them cleanly on shutdown.

The app instance is exported as `app` so uvicorn finds it at `app.main:app`.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_exception_handlers
from app.logging_config import configure_logging
from app.routes import agents as agents_routes
from app.routes import channels as channels_routes
from app.routes import runs as runs_routes
from app.routes import tools as tools_routes
from app.routes import workflows as workflows_routes
from app.tools.registry import import_all_tools
from app.worker import orphan_sweep, run_loop, scheduler_loop
from app.ws.gateway import router as ws_router

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Run startup and shutdown work around the request lifetime."""
    configure_logging()
    log.info("startup_begin", env=settings.app_env)

    # Register every tool so the registry is populated by the time the
    # first request hits the routes.
    import_all_tools()

    # Sweep up orphaned runs from any prior crash before starting fresh
    # workers — otherwise their stale RUNNING rows look real in the UI.
    await orphan_sweep()

    # Start background coroutines. We hold the tasks so shutdown can
    # cancel them; the stop_event makes shutdown deterministic.
    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(run_loop(stop_event), name="worker")
    scheduler_task = asyncio.create_task(scheduler_loop(stop_event), name="scheduler")
    log.info("startup_done")

    try:
        yield
    finally:
        log.info("shutdown_begin")
        stop_event.set()
        # Give both loops their wake-up window plus a small grace.
        await asyncio.gather(worker_task, scheduler_task, return_exceptions=True)
        log.info("shutdown_done")


def create_app() -> FastAPI:
    """Construct the FastAPI app. Called by uvicorn at import time."""
    app = FastAPI(
        title="AAOP API",
        description="AI Agent Orchestration Platform.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — open to the configured origins. The web UI is one of them.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    # Health route is defined inline — no router, no dep injection — so
    # the docker-compose healthcheck doesn't depend on anything else
    # being functional.
    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # REST
    app.include_router(agents_routes.router)
    app.include_router(workflows_routes.router)
    app.include_router(runs_routes.router)
    app.include_router(tools_routes.router)
    app.include_router(channels_routes.router)

    # WebSocket
    app.include_router(ws_router)

    return app


app = create_app()
