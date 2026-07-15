# Vendored: OptionsAnalysis

Source: ~/OptionsAnalysis
Commit: 331b738e877308f50abd3ca7e0dbedffc7d1f78c
Vendored: 2026-07-16
Reason: WS-5 SP1 — embed the QQQ 0DTE ladder into the Market_Analyse dashboard.
        WS-5 SP2a — in-process ETF symbol switch (SPY/QQQ/IWM/DIA).

## Rules
- Treat this tree as OPAQUE. Do not edit internals.
- To update: re-run the rsync copy from the source repo and bump Commit/Vendored above.
- Build artifacts: `frontend/dist` is committed; `frontend/node_modules` and `backend/.venv` are gitignored and provisioned on the box.
