"""Application configuration.

Read once at startup from env vars. Everywhere in the code that needs a
config value imports `settings` from here — no os.getenv scattered
through the codebase. The only intentional exception is the tool layer,
where keys are read lazily so the app can boot even with some keys
missing.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed view of every environment variable the API reads."""

    model_config = SettingsConfigDict(
        # Load root .env for local `uv run` (CWD is api/, so ../.env = repo root).
        # In Docker the file won't exist; pydantic-settings silently skips it and
        # reads from the env vars that docker-compose injects instead.
        env_file="../.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- runtime --------------------------------------------------------
    app_env: str = "development"
    log_level: str = "INFO"

    # --- database -------------------------------------------------------
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aaop"

    # --- CORS -----------------------------------------------------------
    cors_origins: str = "http://localhost:3000"

    # --- LLM ------------------------------------------------------------
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None

    # --- Tools ----------------------------------------------------------
    tavily_api_key: str | None = None

    # --- Telegram -------------------------------------------------------
    telegram_bot_token: str | None = None
    telegram_webhook_secret: str | None = None

    # --- Worker tuning --------------------------------------------------
    # How often the worker polls for pending runs.
    worker_poll_interval_seconds: float = 1.0
    # How often the scheduler tick checks for fire-able schedules.
    scheduler_tick_interval_seconds: float = 60.0
    # Runs in RUNNING state older than this are considered orphaned at
    # startup and marked FAILED.
    orphan_run_after_minutes: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
