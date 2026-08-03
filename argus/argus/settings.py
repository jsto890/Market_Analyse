"""Centralised settings, loaded from .env via pydantic-settings."""
from __future__ import annotations

from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from .db import resolve_db_path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # IBKR
    ibkr_host: str = "127.0.0.1"
    ibkr_port: int = 4003   # IB Gateway paper (7497 = TWS paper, 4001 = Gateway live)
    ibkr_client_id: int = 11
    ibkr_live_trading: bool = False

    # Anthropic
    anthropic_api_key: str = ""

    @field_validator("anthropic_api_key")
    @classmethod
    def _reject_non_keys(cls, v: str) -> str:
        """Anything that is not shaped like a key counts as no key at all.

        `ANTHROPIC_API_KEY=   # add your key from console.anthropic.com` parses
        as a *value* of "# add your key…" — truthy, so every AI call took the
        Claude path and came back 401 instead of falling back to the templated
        report the unset case gives you.
        """
        v = v.strip()
        return v if v.startswith("sk-ant-") else ""
    anthropic_model: str = "claude-opus-4-6"
    # Meta-analyst: lightweight LLM coherence check layered on the rule-based card.
    meta_analyst_model: str = "claude-haiku-4-5"
    meta_analyst_enabled: bool = False   # opt-in; screener loop leaves this off
    meta_analyst_timeout_s: float = 2.0  # hard wall — degrade to neutral past this

    # SMTP
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    alert_email_to: str = ""

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Webhook
    webhook_url: str = ""
    webhook_secret: str = ""

    # Server
    argus_host: str = "127.0.0.1"
    argus_port: int = 8088
    argus_api_token: str = ""

    # Paths
    db_path: Path = Field(default_factory=resolve_db_path)
    data_dir: Path = Path("./.cache")

    # Offline fallback — comma-separated symbols shown via yfinance when IBKR is down
    ibkr_watchlist: str = ""


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
