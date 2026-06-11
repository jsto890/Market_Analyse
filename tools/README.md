# Tools

Offline research and validation scripts — not part of the daily pipeline.

| Directory | Scripts |
|-----------|---------|
| `analysis/` | `analyze_selections.py`, `analyze_downgrades.py`, `analyze_verdict_discrimination.py` |
| `backtest/` | `backtest_selections.py`, `backtest_agents.py` |
| `validation/` | `validate_regime_gate.py` |
| (root) | `label_efficacy.py` — monthly setup-label forward-return study |
| `weight_opt/` | Catalyst weight grid search and revalidation |

All scripts read from `reports/` and write outputs there unless noted.
