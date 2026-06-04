# Market_Analyse (Argus) — Project Context

## Overview
FastAPI + MCP multi-agent technical-analysis ensemble with IBKR integration. Runs an ensemble of technical agents over market data and exposes results via REST and an MCP server. Consumes sentiment from `Market_Review` via `sentiment_bridge.py`. Live trading is gated behind `IBKR_LIVE_TRADING` (default off).

## Agent Shortlist
Curated from `~/.claude/agents/` (140 global agents, available in every project automatically — no copy needed). Spawn these proactively; add more as the work demands.

**Primary**
- `python-pro` — async FastAPI code, MCP handlers, typing
- `fastapi-developer` — endpoints, dependency injection, ASGI structure
- `mcp-developer` — MCP server/tools (`run_mcp.sh`, `install_mcp.sh`)
- `quant-analyst` — technical indicators, ensemble signal logic
- `security-auditor` — **priority**: CORS wildcard + unauthenticated `/api/execute` flagged in readiness audit; secret/`.env` handling

**Situational**
- `llm-architect` / `ai-engineer` — multi-agent ensemble orchestration design
- `api-designer` — REST/MCP contract design before implementing
- `data-scientist` — fundamental feature engineering (`FUNDAMENTAL_FEATURES.md`)
- `code-reviewer` — trading-path safety, gating correctness
