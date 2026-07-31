# Market_Analyse — Project Context

## Overview
Sentiment × technical long-candidate discovery stack. X/Twitter chatter (from companion `~/Market_Review`) is validated through a ~70-agent technical ensemble plus a catalyst/fundamental leg; output is a daily conviction-ranked shortlist, Obsidian report, and live dashboard. Canonical writeup: `OVERVIEW.md`. Local-only, not financial advice.

## Layout & operations
- `argus/` — Argus FastAPI + MCP server, **own `.venv`**, package name `argus`. API kept alive on port 8088 via launchd (`ai.argus.api.plist`). MCP registered as `argus`.
- `sentiment_bridge.py` — combines sentiment + technicals into `reports/bridge_latest.md`; requires `MARKET_REVIEW_REPORT` env (set by the calling scripts).
- Daily pipeline fires 22:00 AEST via launchd `com.market-review.daily` (lives in `~/Market_Review`); reports copied into Obsidian `Finance/Market Reports/`.
- IBKR: TWS live on port 7496 (quote/price subs only — no fundamentals API; yfinance covers fundamentals).
- `odte/` — nested sub-project with its own `CLAUDE.md`.

## Token optimisation
Minimise token spend across planning, implementation, edits, debugging, and responses: query the code graph (tokensave/graphify) before grepping or reading files; read only needed line ranges; make the smallest targeted edit; debug by hypothesis + single discriminating check, not log dumps; keep plans to decisions/tasks only; subagent briefs point to files (path:lines), never paste contents; responses answer first with no recap.

## Session start: code graph + headroom
- Run `graphify update .` at session start (fast, local, no LLM) so `graphify-out/graph.json` matches the current code.
- For architecture/codebase questions, query the graph before grepping: `/graphify`, `graphify explain "X"`, `graphify path "A" "B"`. Highlights: `graphify-out/GRAPH_REPORT.md`.
- Headroom context compression runs as a persistent local proxy (127.0.0.1:8787); Claude Code routes through it automatically. If API calls fail, run `headroom doctor` (revert: `headroom install remove`).
