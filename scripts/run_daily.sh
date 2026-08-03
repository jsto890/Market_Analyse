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

# 1. Sentiment pipeline (Market_Review, unchanged — its own script, its own venv).
# On failure, report the exception that actually stopped the run. The previous
# classifier grepped the whole log for "402|Payment Required" and blamed X credits
# for every non-zero exit; on 2026-08-02 that told the dashboard to top up credits
# when the run had died of file-descriptor exhaustion in fetch-prices, and the X
# leg had in fact succeeded through the Stocktwits fallback.
if zsh "$MR/run_daily.sh"; then
  hb daily-sentiment ok
else
  rc=$?
  mr_log="$MR/logs/daily_$(date +%Y%m%d).log"
  cause="$(grep -oE '^[A-Za-z_.]*(Error|Exception)[^:]*:.*' "$mr_log" 2>/dev/null | tail -1)"
  if [ -z "$cause" ] && grep -q "Fallback sources also failed" "$mr_log" 2>/dev/null; then
    cause="X fetch and free fallback both failed — check X API credits"
  fi
  hb daily-sentiment error "exit $rc${cause:+ — ${cause[1,200]}}"
fi

# 2. Account-trust backtest → reports/account_backtest.csv (feeds dashboard Sources, bug B4)
if (cd "$MR" && PYTHONPATH=src "$MR_PY" -m stock_chatter.cli backtest); then
  hb daily-account-backtest ok "$(wc -l < "$MR/reports/account_backtest.csv" 2>/dev/null || echo '?') rows"
else
  hb daily-account-backtest error "exit $?"
fi

# 3. Dashboard SQLite ingest (bridge CSVs → signals table)
if (cd "$REPO/dashboard" && npm run ingest --silent); then hb daily-ingest ok; else hb daily-ingest error "exit $?"; fi

# 4. Macro sentiment aggregate (FinBERT scores news → macro_sentiment; WS-3b).
#    run_aggregation writes its own detailed macro-aggregate heartbeat on success.
(cd "$REPO/argus" && "$PY" -m argus.macro.run) || hb macro-aggregate error "exit $?"

# 5. Economic calendar refresh (macro seed + tracked-name earnings; WS-3c).
#    run_refresh writes its own detailed calendar-refresh heartbeat on success.
(cd "$REPO/argus" && "$PY" -m argus.calendar.refresh) || hb calendar-refresh error "exit $?"

# 6. Morning brief (macro/futures/calendar/headlines → dashboard + Obsidian; WS-3d).
#    run.py writes its own morning-report heartbeat; append to Obsidian is idempotent.
(cd "$REPO/argus" && "$PY" -m argus.report.run) || hb morning-report error "exit $?"
