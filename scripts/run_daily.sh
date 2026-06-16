#!/usr/bin/env zsh
# Consolidated daily driver — Market_Analyse owns the schedule (master plan §2.4).
# Steps are independent: a failure is logged via heartbeat and the run continues.
set -uo pipefail

# launchd runs with a minimal PATH that excludes Homebrew (node/npm live in
# /opt/homebrew/bin). Without this the dashboard-ingest step fails with exit 127
# (command not found: npm). Prepend Homebrew so node/npm and other CLIs resolve.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
MR="$HOME/Market_Review"
MR_PY="$MR/.venv/bin/python"
PY="$REPO/argus/.venv/bin/python"

hb() { (cd "$REPO/argus" && "$PY" -m argus.heartbeat "$1" "$2" "${3:-}") || true }

# 1. Sentiment pipeline (Market_Review, unchanged — its own script, its own venv)
if zsh "$MR/run_daily.sh"; then hb daily-sentiment ok; else hb daily-sentiment error "exit $?"; fi

# 2. Account-trust backtest → reports/account_backtest.csv (feeds dashboard Sources, bug B4)
if (cd "$MR" && PYTHONPATH=src "$MR_PY" -m stock_chatter.cli backtest); then
  hb daily-account-backtest ok "$(wc -l < "$MR/reports/account_backtest.csv" 2>/dev/null || echo '?') rows"
else
  hb daily-account-backtest error "exit $?"
fi

# 3. Dashboard SQLite ingest (bridge CSVs → signals table)
if (cd "$REPO/dashboard" && npm run ingest --silent); then hb daily-ingest ok; else hb daily-ingest error "exit $?"; fi
