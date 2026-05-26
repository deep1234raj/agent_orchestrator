"""structlog configuration.

Bound once at startup. Every module that does `log = structlog.get_logger(__name__)`
gets the same configuration.

We use JSON output in production-like envs and key-value output in
development — JSON is easier for log aggregators, key-value is easier
for human eyes.
"""
from __future__ import annotations

import logging
import sys

import structlog

from app.config import settings


def configure_logging() -> None:
    """Idempotent. Call once from the app factory."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Standard library logging is what uvicorn writes through. Send those
    # records to stdout at the configured level.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.app_env == "development":
        processors.append(structlog.dev.ConsoleRenderer(colors=True))
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
