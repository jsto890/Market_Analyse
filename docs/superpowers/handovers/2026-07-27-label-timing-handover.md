# Label Timing / OOS Backtest — Handover

**Date:** 2026-07-27 · **State:** research programme complete and closed; production fixes shipped.
**Next action:** two user decisions (below). No engineering is unblocked without one of them.

## What this was

The user's premise: the `action_label` ladder describes where a stock *is*, not where it's
going, and should instead flag names **pre-large-move, strong across short and long horizons**.
The premise was tested and confirmed, then three follow-up tiers were run to find a
forward-looking replacement. None was found. The label stack was cleaned of the gates that
were measurably wrong.

## Authoritative document

`docs/superpowers/specs/2026-07-27-label-timing-findings-and-decision.md` — §1-17, self-contained.
§15 and §16 are retractions/negative results; §17 is the applied change.
Supporting output: `reports/label_oos_analysis_20260727.txt` (§6a gate table is the one that
drove the cleanup), `reports/forward_feature_scan_20260727.txt`.

## Repo state

- Branch `worktree-label-backtest-oos`, **PR #3 open (draft)**: https://github.com/jsto890/Market_Analyse/pull/3
- 7 commits: `03a6ad1` → `6660fdd` → `39c1e77` → `bcd3d14` → `c58f5be` → `b2f4a3a` → `faa0e9a`
- Clean tree, everything pushed. **234 tests pass**, dashboard `tsc` clean.
- Commits verified to contain only intended files — no `sentiment_bridge.py` /
  `com.argus.calendar.plist` standing WIP swept in. Keep it that way; prefer explicit-path
  `git add` over `git add -A` in the main checkout.

## Open decisions (both are the user's, not engineering calls)

**A. Delete the `PRIME_LONG` tier?** §6a tested seven gates on the OOS long-verdict pool;
every one is inverted or neutral, including `adj >= 0.40` (−0.166pp, the worst). Four were
retired (§17). `adj >= 0.40` was kept *only* because it constitutes the tier's definition —
remove it and PRIME_LONG stops meaning "high score" and stops meaning anything. So the tier
has no measured support as a quality ranking; it survives as a state marker rendered
"EXTENDED". Deleting it outright is the logically clean end-point but is a schema change
across dashboard, alerts, screener and the analysis tools. Not started.

**B. Buy a delisting-inclusive data feed?** ~$50-100/mo (Sharadar SEP / Polygon / EODHD).
Buys two things: the small/mid-cap universe the live screener actually trades, and validation
of the large-cap inversion on a non-survivor population. Everything measured in this
programme rests on a survivor-only corpus (§14).

Also outstanding but uncontroversial: **merge PR #3.**

## Verified facts — do NOT re-derive these

1. **Labels rank the past.** Spearman(score, trailing 20d excess) **+0.666**; forward 20d
   **−0.015**. Realised ladder inverts OOS: `AVOID > WATCH > WAIT > STANDARD_LONG > PRIME_LONG`.
   PRIME_LONG is the only tier significantly ≠ 0 and is negative (−0.254%, p=0.045).
2. **Not Argus-specific.** Naive `rev_20` has IC −0.0154 (t −1.46), same sign. It is a
   **mega-cap** effect (thick-liquidity tercile t −2.07, thin ~0). The ensemble is a
   high-fidelity trailing-strength detector, so it concentrates the generic 1-month reversal.
3. **No lead feature works on this universe.** Compression, range contraction, volume dry-up,
   accumulation, dist-52w-high, base depth, 12-1 momentum — all |t| < 1.8, IC ≈ 0. Fitting ML
   on this feature space would learn noise. Only right-shaped construction is
   `mom_12_1 − rev_20` (IC +0.017, t +2.0 at 5d) — correct ordering but ~0.2pp, below cost.
4. **Momentum is regime-conditional** — IC +0.0364 (t 1.79) in 2024-06→26 vs +0.0091 (t 0.56)
   over 2015-24. This is *why* calibration-era thresholds inverted out of sample.
5. **Recorded MFE is censored by the exit rule that produced it.** An earlier "trending target
   is 2× too far" claim was wrong for this reason. First-touch sweep on uncensored paths shows
   expectancy rising monotonically with target distance — that is bull-decade beta, not an
   optimum. What it *does* settle: conviction-scaled targets are unjustified (argmax R:R = 3.0
   in every score quintile). Shipped as flat `builder._RR_MULT = 2.0`.
6. **Event drift is real but not capturable.** Negative-surprise drift measured from the event
   *close* is −0.124% at 2d (t −4.1). Measured from a **day+1 entry** — the earliest a label
   could act, since the label uses data through the event day — it is +0.004% (t −0.4). All of
   it is the event day's own continuation, already in the price. Veto built, disproved,
   reverted (§15). **Lesson: always re-measure an event study from the earliest actionable
   entry, not the event close.**
7. **IBKR cannot supply historical delisted equities.** Tested live on port 4002 (server v176).
   AAPL fine. Delisted names fail `reqContractDetails` via SMART/NASDAQ/NYSE (error 200), but
   `reqMatchingSymbols` finds them under pseudo-exchange **`VALUE`** with real conIds
   (ABMD 265655, XLNX 276222, AGN 196610642) — and history on those conIds returns **0 bars at
   every exchange**, even for windows when the name was actively trading. Reference DB yes,
   price DB no. Do not re-litigate.
8. **Corpus is survivors-only.** 618 of 738 point-in-time S&P names fetched; 120 skipped.
   Missing share 18.7% (2015) → 2.2% (2024). Skipped set is M&A-dominated, so the absent
   takeover premium probably *understates* AVOID and would **strengthen** the inversion.
   Reasoned from composition, not measured.
9. **The non-technical legs are not yet testable.** `options_snapshots` and `unusual_activity`
   start 2026-06-13, `news_items` 2026-06-12, `macro_sentiment` 2026-06-16 — ~6 weeks. With
   overlapping 20d forward windows that is ~1 independent observation per name. This lead
   (§10) becomes testable only after history accumulates; worth confirming those tables are
   retained rather than rolled off.

## Shipped to production this cycle

- Flat `_RR_MULT = 2.0` (was `2.0 + min(|score|, 1.0)`).
- Four harness bugs in `tools/backtest/backtest_agents.py`: earnings look-ahead via
  `datetime.now()` (neutered at module scope so pool workers inherit it), agreement divided by
  all votes instead of actionable, `RS vs Sector` dropped, unreachable `BREAKOUT_LONG`.
  **Any pre-`39c1e77` run of that harness is untrustworthy.**
- Tier badges render state not conviction (`PRIME_LONG` → "EXTENDED", `AVOID` → "WEAK") in
  `dashboard/components/ui/Badge.tsx`, with evidence strings in `title`. Stored values unchanged.
- Four gates retired (§17). Measured effect on a 30-name / 2,070-signal subset: PRIME_LONG
  4.1% → 12.5%, STANDARD_LONG 19.6% → 15.0%, WATCH 37.1% → 33.4%, WAIT/AVOID unchanged;
  9.0% of all labels change. `_WEAK_COMBOS` was retired **to neutral, not inverted** — its
  +0.301pp lift has a CI clear of zero, but inverting it would build a buy rule out of a
  survivor-only mega-cap artefact.

## Environment gotchas

- **The venv lives in the main checkout, not the worktree**: `/Users/josephstorey/Market_Analyse/argus/.venv`.
  Run tests as `cd <worktree>/argus && PYTHONPATH=. /Users/josephstorey/Market_Analyse/argus/.venv/bin/python -m pytest tests/ -q`.
- **Bash cwd persists between tool calls** — this bit twice (a `cd argus` left a later
  repo-root path failing, and a doc append silently landed in the wrong place while the commit
  still succeeded). `cd` back explicitly.
- `reports/backtest_results.csv` (the 167k-signal dump) is **not on disk** and is gitignored —
  regenerating the full label analysis means re-running the harness. `tools/backtest/backtest_agents.py`
  has no CLI args; subset by importing it and slicing `B.UNIVERSE` (see the pattern used for the
  §17 measurement).
- yfinance throws intermittent 401 "Invalid Crumb" under thread pools; it partially self-heals,
  so check row counts rather than trusting a clean exit.
- `pgrep -f <script>` in a waiter shell **matches its own command line** — two waiters once
  deadlocked on each other. Match the pidfile or `pgrep -f "python.*<script>"`.
- `lxml` is missing from the venv, so `yf.Ticker(...).get_earnings_dates()` raises ImportError.
  Not worth installing — it only reaches ~2 years back, unusable for a 2015-2024 study.
- Shared stash stack across worktrees: never bare `git stash` / `git stash pop`.

## If picking this up cold

The research question is **closed**: no forward signal exists in daily price/volume on this
universe, and the one event-conditioned candidate died on an actionable-entry re-measurement.
Do not restart feature scanning on the same corpus — it has been swept. The live paths forward
are decision A (simplify the label to what it honestly is), decision B (change the universe),
or waiting on fact 9 (the non-technical legs). The system's edge remains **SELECTION**, which
is consistent with the WS-4 verdicts in `ws4_p2_validation_verdict` and
`ws4_phase3b2_evaluator_and_thin_corpus`.
