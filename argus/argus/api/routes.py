"""FastAPI routes — the local REST surface.

Single-user, no auth (binds to 127.0.0.1 by default). Argus feature set:

  /api/quote/{sym}           - last price
  /api/history/{sym}         - OHLCV
  /api/indicators/{sym}      - full indicator panel
  /api/action_card/{sym}     - the headline LONG/SHORT/WAIT card
  /api/screener              - run agents across the universe
  /api/flow/{sym}            - options-flow proxy
  /api/portfolio             - live IBKR positions + edge overlay
  /api/account               - IBKR account summary
  /api/execute               - place market or bracket order via IBKR
  /api/chat/{sym}            - chart chat (Claude-grounded)
  /api/analysis/{sym}        - written analyst report
  /api/alert                 - dispatch a manual alert
  /                          - minimal HTML UI
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ..data import get_history, get_quote, get_options_chain, get_realtime_history, IBKRClient
from ..settings import settings


def _require_token(x_argus_token: str = Header(default="")):
    """When ARGUS_API_TOKEN is set, require it on state-changing routes."""
    if settings.argus_api_token and x_argus_token != settings.argus_api_token:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Argus-Token")
from ..indicators import compute_all, INDICATOR_LIST
from ..agents import all_agents
from ..action_card import build_action_card
from ..screener import screen_universe, DEFAULT_UNIVERSE
from ..flow import flow_summary
from ..portfolio import PortfolioTracker
from ..chat import chart_chat, written_analysis
from ..alerts import dispatch_alert, AlertChannels, AlertLog


UI_DIR = Path(__file__).parent.parent / "ui"


# ---------- request models ----------

class ChatReq(BaseModel):
    question: str

class ScreenReq(BaseModel):
    universe: Optional[List[str]] = None
    min_conviction: float = 0.0

class ExecReq(BaseModel):
    symbol: str
    side: str
    qty: int
    type: str = "MKT"
    entry: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[float] = None

class AlertReq(BaseModel):
    title: str
    body: str
    payload: dict = {}
    email: bool = True
    telegram: bool = True
    webhook: bool = True


def build_app() -> FastAPI:
    app = FastAPI(title="Argus", version="0.1.0")
    alert_log = AlertLog()

    if UI_DIR.exists():
        app.mount("/ui", StaticFiles(directory=str(UI_DIR), html=True), name="ui")

    @app.get("/", response_class=HTMLResponse)
    def root():
        idx = UI_DIR / "index.html"
        if idx.exists():
            return idx.read_text(encoding="utf-8")
        return "<h1>Argus</h1><p>UI not built. See /docs for API.</p>"

    @app.get("/health")
    def health():
        return {"ok": True, "ts": datetime.now(timezone.utc).isoformat()}

    @app.get("/api/quote/{symbol}")
    def quote(symbol: str):
        q = get_quote(symbol)
        if not q:
            raise HTTPException(404, "no data")
        return q

    @app.get("/api/history/{symbol}")
    def history(symbol: str, period: str = "1y", interval: str = "1d"):
        df = get_history(symbol, period=period, interval=interval)
        if df.empty:
            raise HTTPException(404, "no data")
        return {
            "symbol": symbol.upper(),
            "period": period,
            "interval": interval,
            "bars": [
                {"ts": str(idx), **{k: float(v) for k, v in row.items()}}
                for idx, row in df.iterrows()
            ],
        }

    @app.get("/api/indicators/{symbol}")
    def indicators(symbol: str, period: str = "1y", interval: str = "1d"):
        df = get_history(symbol, period=period, interval=interval)
        if df.empty:
            raise HTTPException(404, "no data")
        df_ind = compute_all(df)
        last = df_ind.iloc[-1]
        return {
            "symbol": symbol.upper(),
            "as_of": str(df_ind.index[-1]),
            "values": {k: (None if last.get(k) is None or (last.get(k) != last.get(k)) else float(last[k]))
                       for k in INDICATOR_LIST if k in df_ind.columns},
            "indicator_count": len([k for k in INDICATOR_LIST if k in df_ind.columns]),
        }

    @app.get("/api/action_card/{symbol}")
    def action_card(symbol: str):
        df = get_realtime_history(symbol)
        if df.empty:
            raise HTTPException(404, "no data")
        return build_action_card(symbol, df).to_dict()

    @app.get("/api/agents")
    def agents():
        return [{"name": a.name, "family": a.family} for a in all_agents()]

    @app.get("/api/screener")
    def screener_get(min_conviction: float = 0.3):
        cards = screen_universe(DEFAULT_UNIVERSE, min_conviction=min_conviction)
        return {"results": [c.to_dict() for c in cards]}

    @app.post("/api/screener")
    def screener(req: ScreenReq):
        cards = screen_universe(req.universe or DEFAULT_UNIVERSE,
                                min_conviction=req.min_conviction)
        return {"results": [c.to_dict() for c in cards]}

    @app.get("/api/flow/{symbol}")
    def flow(symbol: str, expiration: Optional[str] = None):
        return flow_summary(symbol, expiration)

    @app.get("/api/options/{symbol}")
    def options(symbol: str, expiration: Optional[str] = None):
        return get_options_chain(symbol, expiration)

    @app.get("/api/portfolio")
    def portfolio():
        return PortfolioTracker().positions_with_edge()

    @app.get("/api/account")
    def account():
        try:
            return IBKRClient.instance().account_summary()
        except Exception as e:
            return {"error": str(e)}

    @app.get("/api/fundamentals/{symbol}")
    def fundamentals(symbol: str):
        try:
            return IBKRClient.instance().fundamentals(symbol.upper())
        except Exception as e:
            return {"error": str(e), "symbol": symbol.upper()}

    @app.post("/api/execute", dependencies=[Depends(_require_token)])
    def execute(req: ExecReq):
        ib = IBKRClient.instance()
        if req.type == "MKT":
            return ib.place_market_order(req.symbol, req.side, req.qty)
        if req.type == "BRACKET":
            if not (req.entry and req.stop and req.target):
                raise HTTPException(400, "BRACKET requires entry, stop, target")
            return ib.place_bracket_order(
                req.symbol, req.side, req.qty, req.entry, req.stop, req.target
            )
        raise HTTPException(400, "type must be MKT or BRACKET")

    @app.post("/api/chat/{symbol}")
    def chat(symbol: str, req: ChatReq):
        df = get_history(symbol, period="1y", interval="1d")
        if df.empty:
            raise HTTPException(404, "no data")
        return chart_chat(symbol, df, req.question)

    @app.get("/api/analysis/{symbol}")
    def analysis(symbol: str):
        df = get_history(symbol, period="1y", interval="1d")
        if df.empty:
            raise HTTPException(404, "no data")
        return written_analysis(symbol, df)

    @app.get("/api/bridge")
    def bridge():
        """Return the latest sentiment × technical bridge CSV as JSON rows."""
        import csv as _csv
        bridge_path = Path(__file__).parent.parent.parent.parent / "reports" / "bridge_latest.csv"
        if not bridge_path.exists():
            raise HTTPException(404, "bridge_latest.csv not found — run sentiment_bridge.py first")
        rows = []
        with open(bridge_path, encoding="utf-8") as f:
            for row in _csv.DictReader(f):
                rows.append(dict(row))
        mtime = bridge_path.stat().st_mtime
        generated_at = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
        return {"rows": rows, "generated_at": generated_at, "count": len(rows)}

    @app.post("/api/alert", dependencies=[Depends(_require_token)])
    def alert(req: AlertReq):
        ch = AlertChannels(email=req.email, telegram=req.telegram, webhook=req.webhook)
        out = dispatch_alert(req.title, req.body, req.payload, channels=ch)
        alert_log.log_alert(req.title, req.body, req.payload,
                            {"results": out.results})
        return {"results": out.results}

    return app
