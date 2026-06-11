"""Argus MCP server.

Exposes the full Argus toolset to any MCP-capable client (Claude Desktop,
Cursor, Windsurf, etc). Stdio transport — designed for local use.

Tool naming convention: `argus_<verb>_<object>` so tools are easy to
discover in a multi-server setup.

Run standalone:
    cd <path-to-repo>/argus
    .venv/bin/python -m argus.mcp_server

Wire into Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json):

    {
      "mcpServers": {
        "argus": {
          "command": "<path-to-repo>/argus/.venv/bin/python",
          "args": ["-m", "argus.mcp_server"],
          "cwd": "<path-to-repo>/argus"
        }
      }
    }

IMPORTANT: Use the absolute path to .venv/bin/python (not the system `python`).
Restart Claude Desktop after editing the config.
"""
from __future__ import annotations

from typing import List, Optional
from fastmcp import FastMCP

from ..data import get_history, get_quote, get_options_chain, IBKRClient
from ..indicators import compute_all, INDICATOR_LIST
from ..agents import all_agents
from ..action_card import build_action_card
from ..screener import screen_universe, DEFAULT_UNIVERSE
from ..flow import flow_summary
from ..portfolio import PortfolioTracker
from ..chat import chart_chat, written_analysis
from ..alerts import dispatch_alert, AlertChannels, AlertLog
from ..settings import settings
from datetime import datetime, timezone


def _build_dashboard_html(snapshot: dict) -> str:
    import json

    snapshot_json = json.dumps(snapshot, default=str).replace("</script>", "<\\/script>")
    min_conviction = snapshot.get("min_conviction", 0.2)

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Argus — Live Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{{
  --bg:#0d0f12;--panel:#15181d;--line:#262b33;--text:#e6e8ec;--muted:#8b93a3;
  --green:#1eb854;--red:#e0455a;--amber:#d8a23a;--accent:#7da5ff;--purple:#a78bfa;
  --mono:'SF Mono','Monaco','Menlo',ui-monospace,monospace;
}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{height:100%}}
body{{background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;height:100vh;overflow:hidden}}
header{{padding:9px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--panel)}}
header h1{{font-size:14px;font-weight:700;letter-spacing:.08em}}
header h1 span{{color:var(--muted);font-weight:400}}
.dot{{width:8px;height:8px;border-radius:50%;background:var(--muted);transition:background .4s;flex-shrink:0}}
.dot.online{{background:var(--green)}}.dot.offline{{background:var(--red)}}.dot.snap{{background:var(--amber)}}
#status-lbl{{font:11px var(--mono);color:var(--muted);transition:color .4s}}
#status-lbl.online{{color:var(--green)}}#status-lbl.offline{{color:var(--red)}}#status-lbl.snap{{color:var(--amber)}}
.hdr-right{{margin-left:auto;display:flex;align-items:center;gap:8px}}
.hdr-right span{{font:10px var(--mono);color:var(--muted)}}
.btn-sm{{background:transparent;border:1px solid var(--line);color:var(--muted);padding:3px 8px;border-radius:3px;cursor:pointer;font:11px var(--mono);transition:all .15s}}
.btn-sm:hover{{border-color:var(--accent);color:var(--text)}}
nav{{display:flex;gap:3px;padding:5px 18px;border-bottom:1px solid var(--line);background:var(--panel);flex-shrink:0;flex-wrap:wrap}}
nav button{{background:none;border:1px solid transparent;color:var(--muted);padding:4px 10px;cursor:pointer;font:12px system-ui;border-radius:4px;transition:all .12s;white-space:nowrap}}
nav button:hover{{color:var(--text)}}
nav button.active{{color:var(--text);border-color:var(--line);background:var(--bg)}}
main{{flex:1;overflow-y:auto;overflow-x:hidden}}
.main-inner{{padding:16px 18px;max-width:1440px;margin:0 auto}}
section{{display:none}}section.active{{display:block}}
.row{{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:11px}}
input,select{{background:var(--panel);border:1px solid var(--line);color:var(--text);padding:6px 9px;border-radius:4px;font:13px system-ui;outline:none;transition:border-color .15s}}
input:focus{{border-color:var(--accent)}}
button.primary{{cursor:pointer;background:var(--accent);color:#0a0d12;border:none;font-weight:600;padding:6px 13px;border-radius:4px;font:13px system-ui;transition:filter .15s;white-space:nowrap}}
button.primary:hover{{filter:brightness(1.1)}}
button.primary:disabled{{opacity:.4;cursor:not-allowed}}
button.ghost{{background:transparent;border:1px solid var(--line);color:var(--text);padding:5px 10px;border-radius:4px;cursor:pointer;font:12px system-ui;transition:all .15s;white-space:nowrap}}
button.ghost:hover{{border-color:var(--accent);color:var(--text)}}
button.ghost.active-filter{{border-color:var(--accent);color:var(--accent);background:rgba(125,165,255,.07)}}
.panel{{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px 16px;margin-bottom:12px}}
.panel h3{{margin:0 0 11px;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
.tbl-wrap{{overflow-x:auto}}
table{{width:100%;border-collapse:collapse;font:12px var(--mono)}}
th,td{{text-align:left;padding:6px 9px;border-bottom:1px solid var(--line)}}
th{{color:var(--muted);font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:.06em;position:sticky;top:0;background:var(--panel);z-index:1}}
tr:hover td{{background:rgba(125,165,255,.025)}}
.verdict{{display:inline-block;padding:2px 8px;border-radius:4px;font:11px var(--mono);font-weight:700}}
.verdict.LONG{{background:rgba(30,184,84,.15);color:var(--green)}}
.verdict.SHORT{{background:rgba(224,69,90,.15);color:var(--red)}}
.verdict.WAIT{{background:rgba(139,147,163,.10);color:var(--muted)}}
.kv{{display:grid;grid-template-columns:170px 1fr;row-gap:7px;column-gap:14px;align-items:center}}
.kv .k{{color:var(--muted);font:11px var(--mono)}}.kv .v{{font:13px var(--mono)}}
.pos{{color:var(--green)}}.neg{{color:var(--red)}}.neu{{color:var(--muted)}}
.hi{{color:var(--amber);font-weight:700}}
pre{{font:12px var(--mono);background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:11px;overflow:auto;max-height:380px;white-space:pre-wrap;line-height:1.55}}
.pill{{display:inline-block;padding:2px 7px;margin:2px;border-radius:3px;font:10px var(--mono)}}
.pill.LONG{{background:rgba(30,184,84,.10);color:var(--green);border:1px solid rgba(30,184,84,.3)}}
.pill.SHORT{{background:rgba(224,69,90,.10);color:var(--red);border:1px solid rgba(224,69,90,.3)}}
.pill.WAIT{{background:transparent;color:var(--muted);border:1px solid var(--line)}}
.offline-banner{{display:none;margin-bottom:12px;padding:10px 14px;background:rgba(216,162,58,.07);border:1px solid rgba(216,162,58,.22);border-radius:5px;color:var(--amber);font-size:12px;line-height:1.5}}
.offline-banner.show{{display:block}}
.stat-row{{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:9px;margin-bottom:13px}}
.stat-card{{background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:10px 12px}}
.stat-card .sl{{font:9px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}}
.stat-card .sv{{font:18px/1 var(--mono);font-weight:700}}
.screener-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}}
.scard{{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px;transition:border-color .15s}}
.scard:hover{{border-color:#363c46}}
.scard-hdr{{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}}
.scard-sym{{font-size:18px;font-weight:700;color:#fff}}
.scard-right{{display:flex;align-items:center;gap:6px}}
.score-track{{height:4px;background:var(--line);border-radius:2px;position:relative;margin-bottom:3px}}
.score-fill{{height:100%;border-radius:2px;position:absolute}}
.score-lbl{{font:9px var(--mono);color:var(--muted)}}
.price-row3{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0}}
.pcell{{text-align:center}}
.plbl{{font:9px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:1px}}
.pval{{font:12px var(--mono);color:#fff}}
.vote-row{{display:flex;gap:8px;font:10px var(--mono);margin:6px 0}}
.expand-btn{{background:none;border:none;color:var(--accent);cursor:pointer;font:10px var(--mono);padding:0;text-decoration:underline;display:block;width:100%;text-align:left;margin-top:6px}}
.agents-list{{display:none;margin-top:6px;font:10px var(--mono);color:var(--muted);line-height:1.6}}
.agents-list.open{{display:block}}
.pnl-pos{{color:var(--green)}}.pnl-neg{{color:var(--red)}}
.empty-state{{color:var(--muted);font:12px var(--mono);padding:16px 0}}
.spinner{{display:inline-block;width:9px;height:9px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;margin-right:5px;vertical-align:middle}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
footer{{padding:5px 18px;color:var(--muted);font:10px var(--mono);border-top:1px solid var(--line);flex-shrink:0;text-align:center}}
</style>
</head>
<body>

<header>
  <div class="dot" id="dot"></div>
  <h1>ARGUS <span>/ live dashboard</span></h1>
  <span id="status-lbl">loading…</span>
  <div class="hdr-right">
    <span id="snap-ts"></span>
    <button class="btn-sm" onclick="refreshData()">↺ refresh</button>
  </div>
</header>

<nav id="nav">
  <button class="active" data-tab="screener">Screener</button>
  <button data-tab="portfolio">Portfolio</button>
</nav>

<main>
<div class="main-inner">

  <div class="offline-banner" id="offline-banner">
    ⚡ Showing MCP snapshot — live refresh unavailable (API at 127.0.0.1:8088 not reachable from this context).
    To get live data: open this file directly in Chrome while <code>./run.sh api</code> is running.
  </div>

  <!-- SCREENER -->
  <section id="tab-screener" class="active">
    <div id="summary-stats" class="stat-row"></div>
    <div id="screener-out" class="screener-grid"></div>
  </section>

  <!-- PORTFOLIO -->
  <section id="tab-portfolio">
    <div class="panel">
      <h3>IBKR Positions + Argus Edge</h3>
      <div id="portfolio-out" class="tbl-wrap"></div>
    </div>
  </section>

</div>
</main>

<footer id="footer">Argus MCP artifact · snapshot rendered server-side · live refresh needs 127.0.0.1:8088</footer>

<script>
'use strict';
const SNAPSHOT = {snapshot_json};
const MIN_CONVICTION = {min_conviction};
const API = 'http://127.0.0.1:8088';

const $ = id => document.getElementById(id);
const fmt = (v, d=2) => (v==null||v===''||Number.isNaN(+v)) ? '—' : (+v).toFixed(d);
const fmtPct = (v, d=1) => (v==null||Number.isNaN(+v)) ? '—' : ((+v)*100).toFixed(d)+'%';
const signCls = v => (+v>0?'pos':+v<0?'neg':'neu');
const fmtDollar = v => (v==null||Number.isNaN(+v)) ? '—' : (v>=0?'+':'')+' $'+Math.abs(+v).toFixed(2);

/* ── nav ── */
document.querySelectorAll('#nav button').forEach(btn => {{
  btn.addEventListener('click', () => {{
    document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('main section').forEach(s=>s.classList.remove('active'));
    btn.classList.add('active');
    $('tab-'+btn.dataset.tab).classList.add('active');
  }});
}});

/* ── status ── */
function setStatus(mode) {{
  const dot=$('dot'), lbl=$('status-lbl'), banner=$('offline-banner');
  if (mode==='live') {{
    dot.className='dot online'; lbl.className='online'; lbl.textContent='live · 127.0.0.1:8088';
    banner.className='offline-banner';
  }} else if (mode==='snap') {{
    dot.className='dot snap'; lbl.className='snap'; lbl.textContent='snapshot (MCP)';
    banner.className='offline-banner show';
  }} else {{
    dot.className='dot offline'; lbl.className='offline'; lbl.textContent='offline';
    banner.className='offline-banner show';
  }}
}}

/* ── render summary stats ── */
function renderSummary(results) {{
  const longs  = results.filter(r=>r.verdict==='LONG').length;
  const shorts = results.filter(r=>r.verdict==='SHORT').length;
  const waits  = results.filter(r=>r.verdict==='WAIT').length;
  const hc     = results.filter(r=>r.high_conviction).length;
  $('summary-stats').innerHTML = [
    {{k:'Signals',  v:results.length,  cls:''}},
    {{k:'Long',     v:longs,           cls:'pos'}},
    {{k:'Short',    v:shorts,          cls:'neg'}},
    {{k:'Wait',     v:waits,           cls:'neu'}},
    {{k:'Hi-Conv',  v:hc,              cls:'hi'}},
  ].map(s=>`<div class="stat-card">
    <div class="sl">${{s.k}}</div>
    <div class="sv ${{s.cls}}">${{s.v}}</div>
  </div>`).join('');
}}

/* ── render screener cards ── */
function buildScoreBar(score, verdict) {{
  const pct = Math.min(Math.abs(+score)*100, 100);
  let color = 'var(--muted)', left='50%', width=(pct/2)+'%';
  if (verdict==='LONG')  {{ color='var(--green)'; left='50%'; }}
  if (verdict==='SHORT') {{ color='var(--red)'; left=(50-pct/2)+'%'; }}
  return `<div class="score-track"><div class="score-fill" style="background:${{color}};left:${{left}};width:${{width}}"></div></div>
          <div class="score-lbl">score ${{fmt(score,3)}}</div>`;
}}

function renderScreener(results) {{
  if (!results.length) {{
    $('screener-out').innerHTML='<div class="empty-state">No signals above conviction threshold.</div>';
    return;
  }}
  $('screener-out').innerHTML = results.map(r => {{
    const v = (r.verdict||'WAIT').toUpperCase();
    const hc = r.high_conviction ? '<span class="hi" title="High conviction">⚡</span>' : '';
    const agreed    = (r.agreed||[]).join(', ')||'—';
    const dissented = (r.dissented||[]).join(', ')||'—';
    return `<div class="scard">
      <div class="scard-hdr">
        <span class="scard-sym">${{r.symbol}}</span>
        <div class="scard-right">${{hc}}<span class="verdict ${{v}}">${{v}}</span></div>
      </div>
      ${{buildScoreBar(r.score||0, v)}}
      <div class="price-row3">
        <div class="pcell"><div class="plbl">Entry</div><div class="pval">${{r.entry!=null?'$'+fmt(r.entry):'—'}}</div></div>
        <div class="pcell"><div class="plbl">Stop</div><div class="pval">${{r.stop!=null?'$'+fmt(r.stop):'—'}}</div></div>
        <div class="pcell"><div class="plbl">Target</div><div class="pval">${{r.target!=null?'$'+fmt(r.target):'—'}}</div></div>
      </div>
      <div class="vote-row">
        <span class="pos">L:${{r.long_votes??0}}</span>
        <span class="neg">S:${{r.short_votes??0}}</span>
        <span class="neu">W:${{r.wait_votes??0}}</span>
        <span class="neu" style="margin-left:auto">R:R ${{fmt(r.risk_reward,2)}}x · ${{fmt((r.agreement_pct||0)*100,0)}}% agr</span>
      </div>
      <button class="expand-btn" onclick="toggleAgents(this)">▸ Show agents</button>
      <div class="agents-list">
        <div><b>Agreed:</b> ${{agreed}}</div>
        <div><b>Dissented:</b> ${{dissented}}</div>
      </div>
    </div>`;
  }}).join('');
}}

/* ── render portfolio ── */
function renderPortfolio(positions) {{
  if (!positions||!positions.length) {{
    $('portfolio-out').innerHTML='<div class="empty-state">No positions — IBKR may be offline.</div>';
    return;
  }}
  const edgeCls = e => {{
    if (!e) return 'neu';
    const u=e.toUpperCase();
    return (u.includes('HOLD')||u.includes('ADD'))?'pos':(u.includes('SELL'))?'neg':'neu';
  }};
  $('portfolio-out').innerHTML=`<table><thead><tr>
    <th>Symbol</th><th>Position</th><th>Avg Cost</th><th>Edge</th><th>Verdict</th><th>Score</th><th>HC</th>
  </tr></thead><tbody>${{positions.map(p=>`<tr>
    <td style="font-weight:700">${{p.symbol}}</td>
    <td>${{p.position??'—'}}</td>
    <td>${{p.avg_cost!=null?'$'+fmt(p.avg_cost):'—'}}</td>
    <td class="${{edgeCls(p.edge)}}">${{p.edge||'—'}}</td>
    <td>${{p.verdict?`<span class="verdict ${{p.verdict}}">${{p.verdict}}</span>`:'—'}}</td>
    <td class="${{signCls(p.score)}}">${{fmt(p.score,3)}}</td>
    <td>${{p.high_conviction?'⚡':''}}</td>
  </tr>`).join('')}}</tbody></table>`;
}}

/* ── render all ── */
function render(data) {{
  $('snap-ts').textContent = data.generated_at || '';
  renderSummary(data.screener||[]);
  renderScreener(data.screener||[]);
  renderPortfolio(data.portfolio||[]);
}}

/* ── live fetch ── */
async function fetchLive() {{
  const [sRes, pRes] = await Promise.all([
    fetch(`${{API}}/api/screener`, {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{min_conviction:MIN_CONVICTION}}),signal:AbortSignal.timeout(4000)}}),
    fetch(`${{API}}/api/portfolio`, {{signal:AbortSignal.timeout(4000)}}),
  ]);
  if (!sRes.ok) throw new Error('screener '+sRes.status);
  const screener   = await sRes.json();
  const portfolio  = await pRes.json();
  return {{
    generated_at: new Date().toISOString().slice(0,16).replace('T',' ')+' UTC',
    screener:      screener.results||[],
    portfolio:     Array.isArray(portfolio)?portfolio:(portfolio.positions||[]),
  }};
}}

async function refreshData() {{
  try {{
    const live = await fetchLive();
    render(live);
    setStatus('live');
  }} catch(e) {{
    render(SNAPSHOT);
    setStatus('snap');
  }}
}}

/* ── init ── */
function toggleAgents(btn) {{
  const list = btn.nextElementSibling;
  list.classList.toggle('open');
  btn.textContent = list.classList.contains('open') ? '▾ Hide agents' : '▸ Show agents';
}}

// On load: try live, gracefully fall back to baked snapshot
refreshData();
</script>
</body>
</html>"""


def build_mcp() -> FastMCP:
    mcp = FastMCP("argus")
    alert_log = AlertLog()

    # ---------------- DATA ----------------

    @mcp.tool()
    def argus_get_quote(symbol: str) -> dict:
        """Last price, day change %, and volume for a US-listed symbol.

        Args:
            symbol: Ticker, e.g. "AAPL". Case-insensitive.
        """
        q = get_quote(symbol)
        if not q:
            return {"error": f"No data for {symbol}. Check the ticker."}
        return q

    @mcp.tool()
    def argus_get_history(
        symbol: str, period: str = "1y", interval: str = "1d"
    ) -> dict:
        """OHLCV history for a symbol.

        Args:
            symbol: Ticker.
            period: yfinance period — '1mo','3mo','6mo','1y','2y','5y','10y','max'.
            interval: '1d','1h','15m','5m','1m'. Intraday windows are limited
                by yfinance to ~60 days.
        """
        df = get_history(symbol, period=period, interval=interval)
        if df.empty:
            return {"error": f"No history for {symbol}"}
        return {
            "symbol": symbol.upper(),
            "period": period,
            "interval": interval,
            "rows": len(df),
            "first_ts": str(df.index[0]),
            "last_ts": str(df.index[-1]),
            "last_close": float(df["close"].iloc[-1]),
        }

    @mcp.tool()
    def argus_list_indicators() -> dict:
        """Names of every indicator Argus computes."""
        return {"indicators": INDICATOR_LIST, "count": len(INDICATOR_LIST)}

    @mcp.tool()
    def argus_get_indicators(symbol: str, period: str = "1y") -> dict:
        """Compute all 58+ indicators for a symbol and return their last values.

        Use this when you need raw indicator readings to ground your reasoning.
        """
        df = get_history(symbol, period=period, interval="1d")
        if df.empty:
            return {"error": f"No history for {symbol}"}
        ind = compute_all(df)
        last = ind.iloc[-1]
        return {
            "symbol": symbol.upper(),
            "as_of": str(ind.index[-1]),
            "values": {
                k: (None if last.get(k) is None or last.get(k) != last.get(k) else float(last[k]))
                for k in INDICATOR_LIST if k in ind.columns
            },
        }

    # ---------------- ACTION CARD ----------------

    @mcp.tool()
    def argus_action_card(symbol: str) -> dict:
        """The headline LONG / SHORT / WAIT verdict.

        Runs all 45+ voting agents and synthesises them into a single Action
        Card with entry, stop, target, risk-reward, and the list of agents
        that agreed vs. dissented.

        High-conviction signals (≥75% agreement among actionable votes) are
        flagged with `high_conviction: true`.
        """
        df = get_history(symbol, period="1y", interval="1d")
        if df.empty:
            return {"error": f"No history for {symbol}"}
        return build_action_card(symbol, df).to_dict()

    @mcp.tool()
    def argus_list_agents() -> dict:
        """Every voting agent and its family (trend/momentum/volume/volatility/structure/institutional)."""
        return {"agents": [{"name": a.name, "family": a.family} for a in all_agents()]}

    # ---------------- SCREENER ----------------

    @mcp.tool()
    def argus_screen(
        symbols: Optional[List[str]] = None,
        min_conviction: float = 0.3,
    ) -> dict:
        """Run the agent stack across a universe of tickers and return ranked Action Cards.

        Args:
            symbols: Optional override list. Defaults to ~45 large-cap stocks
                + sector ETFs.
            min_conviction: Filter — only return cards whose |score| >= this.
                0.0 returns everything; 0.5 returns the strongest signals.
        """
        cards = screen_universe(symbols or DEFAULT_UNIVERSE, min_conviction=min_conviction)
        return {"results": [c.to_dict() for c in cards], "count": len(cards)}

    # ---------------- FLOW ----------------

    @mcp.tool()
    def argus_options_flow(symbol: str, expiration: Optional[str] = None) -> dict:
        """Flow Intelligence proxy: put/call ratios, IV skew, max pain, and
        unusual-volume strikes.

        Note: built on free end-of-day chains. Real-time sweep/block detection
        requires a paid vendor feed.
        """
        return flow_summary(symbol, expiration)

    @mcp.tool()
    def argus_options_chain(symbol: str, expiration: Optional[str] = None) -> dict:
        """Raw options chain (calls + puts) for an expiration."""
        return get_options_chain(symbol, expiration)

    # ---------------- PORTFOLIO ----------------

    @mcp.tool()
    def argus_portfolio() -> dict:
        """Live IBKR positions overlaid with current Argus edge
        (HOLD/ADD, CONSIDER SELLING, NEUTRAL).

        Requires TWS / IB Gateway running and API enabled.
        """
        try:
            return {"positions": PortfolioTracker().positions_with_edge()}
        except Exception as e:
            return {"error": f"IBKR connection failed: {e}. Is TWS/Gateway running?"}

    @mcp.tool()
    def argus_account_summary() -> dict:
        """Net liq, cash, buying power etc. from IBKR."""
        try:
            return IBKRClient.instance().account_summary()
        except Exception as e:
            return {"error": str(e)}

    # ---------------- EXECUTION (gated) ----------------

    @mcp.tool()
    def argus_place_market_order(symbol: str, side: str, qty: int) -> dict:
        """Place a market order via IBKR. Disabled unless IBKR_LIVE_TRADING=1.

        Args:
            symbol: Ticker.
            side: BUY or SELL.
            qty: Whole shares.
        """
        return IBKRClient.instance().place_market_order(symbol, side, qty)

    @mcp.tool()
    def argus_place_bracket_order(
        symbol: str, side: str, qty: int, entry: float, stop: float, target: float
    ) -> dict:
        """Place a bracket order (entry limit + stop + take-profit).
        Disabled unless IBKR_LIVE_TRADING=1.
        """
        return IBKRClient.instance().place_bracket_order(
            symbol, side, qty, entry, stop, target
        )

    # ---------------- AI ----------------

    @mcp.tool()
    def argus_chart_chat(symbol: str, question: str) -> dict:
        """Ask a free-form question grounded in the symbol's live indicator panel.
        Uses Anthropic if ANTHROPIC_API_KEY is set, else returns a templated
        context payload.
        """
        df = get_history(symbol, period="1y", interval="1d")
        if df.empty:
            return {"error": f"No history for {symbol}"}
        return chart_chat(symbol, df, question)

    @mcp.tool()
    def argus_written_analysis(symbol: str) -> dict:
        """Generate a written analyst report (trend, S/R, volume, momentum,
        thesis, risk-reward) for a symbol."""
        df = get_history(symbol, period="1y", interval="1d")
        if df.empty:
            return {"error": f"No history for {symbol}"}
        return written_analysis(symbol, df)

    # ---------------- ALERTS ----------------

    @mcp.tool()
    def argus_send_alert(
        title: str,
        body: str,
        payload: dict = {},
        email: bool = True,
        telegram: bool = True,
        webhook: bool = True,
    ) -> dict:
        """Dispatch an alert across configured channels (email/Telegram/webhook).
        Uses HMAC-signed webhooks if WEBHOOK_SECRET is set.
        """
        ch = AlertChannels(email=email, telegram=telegram, webhook=webhook)
        out = dispatch_alert(title, body, payload, channels=ch)
        alert_log.log_alert(title, body, payload, {"results": out.results})
        return {"results": out.results}

    # ---------------- META ----------------

    @mcp.tool()
    def argus_status() -> dict:
        """Health check: which integrations are configured."""
        return {
            "version": "0.1.0",
            "anthropic_configured": bool(settings.anthropic_api_key),
            "telegram_configured": bool(settings.telegram_bot_token and settings.telegram_chat_id),
            "smtp_configured": bool(settings.smtp_host and settings.alert_email_to),
            "webhook_configured": bool(settings.webhook_url),
            "ibkr_live_trading": settings.ibkr_live_trading,
            "agent_count": len(all_agents()),
            "indicator_count": len(INDICATOR_LIST),
        }

    @mcp.tool()
    def argus_dashboard(min_conviction: float = 0.2) -> str:
        """Generate a self-contained HTML dashboard artifact showing current market signals.

        Returns complete HTML that Claude Desktop renders as an interactive artifact.
        Shows screener results and portfolio overlay.
        Tries to fetch live data from localhost:8088; falls back to embedded snapshot.

        Args:
            min_conviction: Minimum |score| to include in screener. 0.0 = all, 0.5 = strong signals only.
        """
        import json
        from datetime import datetime, timezone

        cards = screen_universe(DEFAULT_UNIVERSE, min_conviction=min_conviction)
        try:
            portfolio = PortfolioTracker().positions_with_edge()
        except Exception:
            portfolio = []

        snapshot = {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "screener": [c.to_dict() for c in cards],
            "portfolio": portfolio,
            "min_conviction": min_conviction,
        }
        return _build_dashboard_html(snapshot)

    return mcp


def run_stdio() -> None:
    build_mcp().run(transport="stdio")  # explicit — safe across all FastMCP versions


if __name__ == "__main__":
    run_stdio()
