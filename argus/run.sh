#!/usr/bin/env bash
# Convenience launcher.
# Usage:
#   ./run.sh setup   - create venv and install deps
#   ./run.sh api     - run the FastAPI + UI on http://127.0.0.1:8088
#   ./run.sh mcp     - run the stdio MCP server (for Claude Desktop / Cursor)
#   ./run.sh test    - run the smoke test
set -euo pipefail
cd "$(dirname "$0")"

VENV=".venv"
PY="${VENV}/bin/python"

case "${1:-api}" in
  setup)
    python3 -m venv "${VENV}"
    "${PY}" -m pip install --upgrade pip wheel
    "${PY}" -m pip install -r requirements.txt
    [ -f .env ] || cp .env.example .env
    echo
    echo "Installed. Edit .env, start TWS/IB Gateway, then: ./run.sh api"
    ;;
  api)
    [ -d "${VENV}" ] || { echo "Run ./run.sh setup first"; exit 1; }
    "${PY}" -m argus.main
    ;;
  mcp)
    [ -d "${VENV}" ] || { echo "Run ./run.sh setup first"; exit 1; }
    "${PY}" -m argus.mcp_server
    ;;
  test)
    [ -d "${VENV}" ] || { echo "Run ./run.sh setup first"; exit 1; }
    "${PY}" -m pytest -q tests/ || true
    "${PY}" tests/smoke.py
    ;;
  *)
    echo "Unknown command: $1"
    echo "Usage: $0 {setup|api|mcp|test}"
    exit 2
    ;;
esac
