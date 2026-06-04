#!/bin/bash
ARGUS_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ARGUS_DIR"
export PYTHONPATH="$ARGUS_DIR"
exec "$ARGUS_DIR/.venv/bin/python" -m argus.mcp_server
