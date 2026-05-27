"""Channel registration.

Called from the FastAPI lifespan. We construct each channel from
configuration and register it. Missing config means the channel isn't
registered — the system still boots, and routes that would use it
fail cleanly with a clear error message rather than crashing on import.
"""
from __future__ import annotations

import structlog

from app.channels.base import register_channel
from app.channels.telegram import TelegramChannel
from app.config import settings

log = structlog.get_logger(__name__)


def register_all_channels() -> None:
    """Wire up every channel for which credentials are configured."""
    if settings.telegram_bot_token:
        register_channel(
            TelegramChannel(
                bot_token=settings.telegram_bot_token,
                webhook_secret=settings.telegram_webhook_secret,
            )
        )
        log.info("channel_registered", kind="telegram")
    else:
        log.info("channel_skipped", kind="telegram",
                 reason="TELEGRAM_BOT_TOKEN not set")
