# OptionsAnalysis — Project Context

## Overview
Local-first analytics app for QQQ 0DTE options. Streams live data from IBKR (`ib_insync`), computes contract/strike signals, and surfaces a decision-focused ladder for **manual** execution (analytics only — places no orders). Stack: FastAPI backend, React + Vite + TypeScript frontend, Electron desktop shell (PyInstaller-packaged).

## Agent Shortlist
Curated from `~/.claude/agents/` (140 global agents, available in every project automatically — no copy needed). Spawn these proactively; add more as the work demands.

**Primary**
- `fastapi-developer` — backend endpoints, streaming, dependency injection
- `python-pro` — IBKR data handling, signal computation, typing
- `react-specialist` — ladder UI, real-time component updates
- `typescript-pro` — frontend types, end-to-end type safety
- `websocket-engineer` — live IBKR → frontend streaming pipeline
- `quant-analyst` — 0DTE contract/strike signal logic

**Situational**
- `electron-pro` — desktop packaging, native integration, distribution
- `ui-designer` — decision-focused ladder design and clarity
- `api-designer` — backend ↔ frontend contract
- `performance-engineer` — live-data render/throughput latency
- `code-reviewer` — streaming correctness, signal accuracy
