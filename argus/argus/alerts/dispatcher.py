"""Multi-channel alert dispatcher: email, Telegram, HMAC-signed webhook.

SMS and WhatsApp are intentionally not implemented — both require paid
gateways (Twilio etc.). Wire them in here if you want them later.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import smtplib
from dataclasses import dataclass, field
from email.mime.text import MIMEText
from typing import List

import httpx

from ..settings import settings


@dataclass
class AlertChannels:
    email: bool = True
    telegram: bool = True
    webhook: bool = True
    results: List[dict] = field(default_factory=list)


def _send_email(subject: str, body: str) -> dict:
    if not (settings.smtp_host and settings.smtp_user and settings.alert_email_to):
        return {"channel": "email", "ok": False, "reason": "not configured"}
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.smtp_user
    msg["To"] = settings.alert_email_to
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
            s.starttls()
            s.login(settings.smtp_user, settings.smtp_pass)
            s.send_message(msg)
        return {"channel": "email", "ok": True}
    except Exception as e:
        return {"channel": "email", "ok": False, "error": str(e)}


def _send_telegram(text: str) -> dict:
    if not (settings.telegram_bot_token and settings.telegram_chat_id):
        return {"channel": "telegram", "ok": False, "reason": "not configured"}
    try:
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
        r = httpx.post(url, json={
            "chat_id": settings.telegram_chat_id,
            "text": text,
            "parse_mode": "Markdown",
        }, timeout=10)
        return {"channel": "telegram", "ok": r.is_success, "status": r.status_code}
    except Exception as e:
        return {"channel": "telegram", "ok": False, "error": str(e)}


def _send_webhook(payload: dict) -> dict:
    if not settings.webhook_url:
        return {"channel": "webhook", "ok": False, "reason": "not configured"}
    body = json.dumps(payload, default=str).encode("utf-8")
    sig = ""
    if settings.webhook_secret:
        sig = hmac.new(
            settings.webhook_secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
    try:
        r = httpx.post(
            settings.webhook_url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Argus-Signature": f"sha256={sig}" if sig else "",
            },
            timeout=10,
        )
        return {"channel": "webhook", "ok": r.is_success, "status": r.status_code}
    except Exception as e:
        return {"channel": "webhook", "ok": False, "error": str(e)}


def dispatch_alert(
    title: str,
    body: str,
    payload: dict,
    channels: AlertChannels = AlertChannels(),
) -> AlertChannels:
    text_md = f"*{title}*\n```\n{body}\n```"
    if channels.email:
        channels.results.append(_send_email(title, body))
    if channels.telegram:
        channels.results.append(_send_telegram(text_md))
    if channels.webhook:
        channels.results.append(_send_webhook({"title": title, "body": body, "data": payload}))
    return channels
