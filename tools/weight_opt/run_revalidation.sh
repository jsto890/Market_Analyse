#!/usr/bin/env zsh
# 6-week weight-optimisation re-validation — fired once by launchd on 2026-07-21.
# Rebuilds the forward-return panel (now with elapsed 20d returns + ~40 dates),
# re-runs the rank-IC grid search + permutation null, the ridge sign-check, the
# catalyst vote validation, and the IC plot. Self-disables afterwards (one-shot).
set -euo pipefail

set +e; source /Users/josephstorey/.zprofile 2>/dev/null; set -euo pipefail

PY=/Users/josephstorey/anaconda3/bin/python
MA=/Users/josephstorey/Market_Analyse
LABEL=ai.argus.weight-revalidation
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

LOG="$MA/logs/weight_revalidation_$(date +%Y%m%d).log"
exec >> "$LOG" 2>&1

echo "===== Weight re-validation — $(date) ====="
cd "$MA"
"$PY" tools/weight_opt/historical_bridge_dataset.py
"$PY" tools/weight_opt/grid_search.py
"$PY" tools/weight_opt/ridge_sanity.py
"$PY" tools/weight_opt/vote_validation.py
"$PY" tools/weight_opt/plot_ic.py
echo "----- Results in $MA/docs/weight_optimisation/ -----"
echo "Review grid_search permutation_null.csv + catalyst_weight_history.csv, then"
echo "update config/weights.yaml only if an optimum beats the null (p<0.05) and is"
echo "horizon-stable. See docs/weight_optimisation/weight_decision.md for the gate."

# One-shot: disable and remove this job so it does not fire again next year.
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
rm -f "$PLIST"
echo "===== Done; launchd job removed — $(date) ====="
