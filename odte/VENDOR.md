# Vendored: OptionsAnalysis

Source: ~/OptionsAnalysis
Commit: f7c1240aed9cfd21cdfcd0e3a7679a69573fe53d
Vendored: 2026-06-30
Reason: WS-5 SP1 — embed the QQQ 0DTE ladder into the Market_Analyse dashboard.

## Rules
- Treat this tree as OPAQUE. Do not edit internals.
- To update: re-run the rsync copy from the source repo and bump Commit/Vendored above.
- Build artifacts: `frontend/dist` is committed; `frontend/node_modules` and `backend/.venv` are gitignored and provisioned on the box.
