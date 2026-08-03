#!/usr/bin/env zsh
# job_wrapper.sh <job-name> <command...>
# Sources repo .env, keeps the machine awake, writes start/ok/error heartbeats.
# Every scheduled job in launchd runs through this wrapper (master plan §2.4).
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [[ -f "$REPO/.env" ]] && source "$REPO/.env"; set +a

JOB="$1"; shift
PY="$REPO/argus/.venv/bin/python"

# launchd hands its children a 256-file soft limit. The daily run walks ~1000
# tickers through yfinance and exhausts it mid-run: every remaining download
# fails with "unable to open database file" and the run dies in fetch-prices
# with Errno 24, before the bridge step. Raise it for every scheduled job.
ulimit -n 4096 2>/dev/null || true

# macOS ships no timeout(1), so nothing bounded a job's runtime — com.argus.macro
# sat for ten days on an ESTABLISHED socket with no read deadline, and launchd
# will not start a second instance of a label that never exits, so ~740 scheduled
# runs were silently suppressed. Perl gives the child its own process group, so
# TERM reaches the whole tree rather than just caffeinate. 124 = deadline hit,
# matching GNU timeout.
JOB_TIMEOUT="${JOB_TIMEOUT:-3600}"

run_with_deadline() {
  /usr/bin/perl -e '
    my $secs = shift @ARGV;
    my $pid  = fork();
    die "fork: $!" unless defined $pid;
    if ($pid == 0) { setpgrp(0, 0); exec @ARGV; exit 127; }
    $SIG{ALRM} = sub { kill "TERM", -$pid; sleep 15; kill "KILL", -$pid; exit 124; };
    alarm $secs;
    waitpid($pid, 0);
    my $st = $?;
    alarm 0;
    exit($st & 127 ? 128 + ($st & 127) : $st >> 8);
  ' "$JOB_TIMEOUT" /usr/bin/caffeinate -i "$@"
}

# launchd appends to StandardErrorPath forever and rotates nothing, so the odte
# daemon's reconnect loop grew logs/odte_error.log to 66MB of the same line.
# Truncating in place rather than renaming is the whole trick: a daemon holds an
# open O_APPEND fd on that inode, and a rename would leave it writing to a file
# nobody reads. The last MAX_KEEP bytes are kept beside it as .1.
rotate_logs() {
  local max=$((8 * 1024 * 1024)) keep=$((512 * 1024)) f size
  for f in "$REPO"/logs/*.log(N); do
    size=$(stat -f%z "$f" 2>/dev/null) || continue
    [ "$size" -gt "$max" ] || continue
    tail -c "$keep" "$f" > "$f.1" 2>/dev/null || continue
    : > "$f"
    echo "[job_wrapper] rotated $f at ${size}B; tail kept in $f.1" >&2
  done
}
rotate_logs

hb() { (cd "$REPO/argus" && "$PY" -m argus.heartbeat "$JOB" "$1" "${2:-}") || true }

hb running "started $(date '+%H:%M:%S')"
if run_with_deadline "$@"; then
  hb ok "completed $(date '+%H:%M:%S')"
else
  rc=$?
  if [ "$rc" -eq 124 ]; then
    hb error "timed out after ${JOB_TIMEOUT}s at $(date '+%H:%M:%S')"
  else
    hb error "exit $rc at $(date '+%H:%M:%S')"
  fi
  exit $rc
fi
