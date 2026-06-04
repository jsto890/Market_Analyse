"""Centralised settings, loaded from .env via pydantic-settings."""
from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # IBKR
    ibkr_host: str = "127.0.0.1"
    ibkr_port: int = 7497
    ibkr_client_id: int = 11
    ibkr_live_trading: bool = False

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-6"

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
    db_path: Path = Path("argus.db")
    data_dir: Path = Path("./.cache")

    # Offline fallback — comma-separated symbols shown via yfinance when IBKR is down
    ibkr_watchlist: str = ""


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
