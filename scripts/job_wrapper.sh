#!/usr/bin/env zsh
# job_wrapper.sh <job-name> <command...>
# Sources repo .env, keeps the machine awake, writes start/ok/error heartbeats.
# Every scheduled job in launchd runs through this wrapper (master plan §2.4).
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [[ -f "$REPO/.env" ]] && source "$REPO/.env"; set +a

JOB="$1"; shift
PY="$REPO/argus/.venv/bin/python"

hb() { (cd "$REPO/argus" && "$PY" -m argus.heartbeat "$JOB" "$1" "${2:-}") || true }

hb running "started $(date '+%H:%M:%S')"
if /usr/bin/caffeinate -i "$@"; then
  hb ok "completed $(date '+%H:%M:%S')"
else
  rc=$?
  hb error "exit $rc at $(date '+%H:%M:%S')"
  exit $rc
fi
