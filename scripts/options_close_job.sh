#!/usr/bin/env zsh
# options_close_job.sh — close snapshot, then scorer, then GEX (master plan WS-1).
# Runs through job_wrapper.sh; each sub-step also writes its own heartbeat.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PY="$REPO/argus/.venv/bin/python"
cd "$REPO/argus"
"$PY" -m argus.options_intel.snapshot --kind close
"$PY" -m argus.options_intel.unusual
"$PY" -m argus.options_intel.gex
