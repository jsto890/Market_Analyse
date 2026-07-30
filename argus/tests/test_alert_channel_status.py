def test_channel_status_reflects_settings(monkeypatch):
    from argus.alerts import dispatcher
    from argus.settings import settings

    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_user", "")
    monkeypatch.setattr(settings, "alert_email_to", "")
    monkeypatch.setattr(settings, "telegram_bot_token", "123:abc")
    monkeypatch.setattr(settings, "telegram_chat_id", "456")
    monkeypatch.setattr(settings, "webhook_url", "")

    status = dispatcher.channel_status()
    assert status == {"email": False, "telegram": True, "webhook": False}
