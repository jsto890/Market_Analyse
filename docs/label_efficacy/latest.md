# Label Efficacy — 2026-06-10

_431 names with a measurable forward window, from first-label date._

## Forward returns by first label (median %)

| label | n | 5d | 10d | 20d | peak | now | %pos 20d | %hit +15% |
|---|---|---|---|---|---|---|---|---|
| fresh_watch | 12 | -3.3 | -2.1 | 6.8 | 10.8 | -0.3 | 58% | 38% |
| building | 14 | 4.4 | -1.5 | 7.2 | 10.7 | 3.8 | 79% | 31% |
| momentum_confirmed | 6 | 4.6 | 6.1 | 12.1 | 15.0 | 5.1 | 83% | 50% |
| extended | 43 | 2.2 | 2.6 | 10.3 | 16.2 | 1.2 | 67% | 56% |
| late_chase | 42 | 9.2 | 7.2 | 23.5 | 28.2 | 4.2 | 69% | 72% |
| avoid_wait | 32 | 0.2 | -2.6 | 9.7 | 7.8 | -3.7 | 62% | 39% |
| noise | 76 | -0.2 | 1.2 | 2.9 | 4.8 | -0.6 | 59% | 27% |

## avoid_wait: winners (peak≥20%) vs losers (f20≤0) — label-time features

| feature | winners | losers |
|---|---|---|
| 20d momentum | 35.4 | 8.5 |
| dist from high | -6.1 | -10.7 |

## fresh_watch

- n=12, median 20d 6.8%, %hit +15% 33%
- winners' median 20d-momentum-at-label 76.0% vs all 20.5%

_Caveat: forward returns are regime-dependent; read alongside the market regime of the window. Re-tune setups.py thresholds only on a multi-regime trend, not a single month._