# Literature-Grounded Catalyst Sub-Signal Weights

**Target use:** entry signal to be IN a US stock before a large move; horizons 1 day to 6 months. Optimising for catching big movers (right-tail), not steady drift.

> Source: research synthesis (research-analyst agent, 2026-06-09). Weights are conditional on the signal firing — the catalyst meta-score renormalises over non-abstaining sub-agents, so these are relative weights among signals that actually have data.

---

## 1. Per-Signal Evidence Summary

### event_catalyst (M&A / FDA / major contracts) — current 0.40
- **Effect size:** largest single-name abnormal returns in the literature. M&A target CARs 15–30% in [-1,+1]; FDA/clinical events routinely double-digit single-day for small biotech.
- **Horizon:** concentrated in announcement day + 0–5 days, decays sharply.
- **Critical caveat (tradability):** these are *announcement* returns — by the time the event is public news (what the signal scores), the move has already happened. Post-announcement merger-arb spread is only ~3–7% with deal-break tail risk. Realisable entry edge depends entirely on whether the signal captures the *pre/early-event* window (rumour, unusual options/volume) vs confirmed public news.
- **Failure modes:** rumour false positives, negative-event asymmetry (bad news persists longer), binary FDA downside (CRLs).

### earnings_proximity (PEAD / pre-earnings premium) — current 0.15
- **Effect size:** PEAD ~2% over 60d for good-news (Bernard & Thomas), but **largely disappeared in non-microcaps post-2001** (decimalisation/HFT) — survives mainly in small/illiquid names. Earnings-announcement premium (Frazzini & Lamont) ≈ 60bp/month into scheduled announcements, robust.
- **Horizon:** pre-earnings premium days–weeks into the date; PEAD ~60d post, decaying.
- **Best genuine *entry* property of the set:** a scheduled volatility event with a documented pre-announcement premium. Predicts *when* big moves cluster; weak on direction.

### squeeze_setup (short %-float, days-to-cover) — current 0.20
- **Two mechanisms, opposite directions:** short interest as a signal robustly predicts *underperformance* (Boehmer-Jones-Zhang ~15.6% annualised; Lamont-Thaler) — wrong way for a long. The upside *squeeze* is a real but low-frequency, hard-to-time right-tail event; DTC is often lagging.
- **Failure modes:** severe slippage/halts during real squeezes (naive backtests overstate fills); base signal points down.
- **Unique value:** the only signal targeting explosive *upside* tails directly — justified as a small lottery-ticket weight, not a core driver.

### growth_profitability (revenue growth + margin) — current 0.15
- **Effect size:** among the most replicated factors (Novy-Marx gross profitability ≈ book-to-market power; Fama-French RMW).
- **Horizon:** slow — a months-to-years factor premium, not a catalyst.
- **Fit:** poor for discrete large moves over 1d–6m. Real value here is as a *quality filter / confirmation overlay* (avoid catalysts on junk), raising others' precision.

### analyst_upside (consensus target upside + rating) — current 0.10
- **Mixed, weakest as specified.** Recommendation *changes/revisions* carry real information (Womack +3.0%/−4.7% announcement, post-drift +2.4%/−9.1% over 6m). But price-target *levels* (what this signal uses) are badly biased: ~9.4% upward optimism, ~24.8% absolute error, ~54% directional. High consensus optimism predicts *lower* subsequent returns.
- **Fix:** re-spec to score *revisions/downgrades* rather than target-upside level, then revisit weight.

---

## 2. Ranked Ordering (value for catching LARGE forward moves)

1. **event_catalyst** — uniquely large magnitudes; #1 *only if* it captures the pre/early-event window. Strong asterisk on tradability.
2. **earnings_proximity** — best genuine *entry* property (scheduled event + pre-announcement premium).
3. **squeeze_setup** — only signal targeting explosive upside tails; low hit-rate, hard timing, base rate points down.
4. **growth_profitability** — well-replicated but wrong horizon/type; best as quality filter.
5. **analyst_upside** — weakest as specified (uses biased levels); real edge is in revisions.

---

## 3. Recommended Weight Vectors

**Baseline (applied to production):**
```python
catalyst_weights = {
    "event_catalyst":       0.32,
    "earnings_proximity":   0.24,
    "squeeze_setup":        0.18,
    "growth_profitability": 0.13,
    "analyst_upside":       0.08,
}  # sum = 1.00
```
Rationale vs current (0.40/0.20/0.15/0.15/0.10): trim event_catalyst (confirmed public events partly un-tradable as entries); raise earnings_proximity (strongest pre-event signal); nudge squeeze down (low hit-rate, wrong-way base rate); hold growth as quality overlay; trim analyst_upside (level bias).

**High-conviction-events variant** (only if event_catalyst genuinely *leads* the public move):
```python
catalyst_weights_high_conviction = {
    "event_catalyst":       0.50,
    "earnings_proximity":   0.18,
    "squeeze_setup":        0.13,
    "growth_profitability": 0.09,
    "analyst_upside":       0.10,
}  # sum = 1.00
```

---

## 4. Confidence & Caveats

| Signal | Weight confidence | Basis |
|---|---|---|
| earnings_proximity | High | Frazzini-Lamont + B&T robust; entry logic sound. Keep small-cap-aware. |
| growth_profitability | High (factor) / Medium (this weight) | Novy-Marx/FF5 replicated, but horizon mismatch → weight is judgement. |
| event_catalyst | Medium | Magnitude certain; realisable edge depends on lead-vs-lag implementation. Biggest source of weight uncertainty. |
| analyst_upside | Medium-low | Levels biased, changes carry the edge; re-spec to revisions. |
| squeeze_setup | Low (prior) | Right-tail real but base signal points down; lottery-ticket prior awaiting forward validation. |

**Two implementation recommendations that matter more than the exact weights:**
1. Determine empirically whether `event_catalyst` *leads* or *lags* the price move. If it lags, no weight fixes it — re-scope toward rumour/pre-announcement signals.
2. Re-spec `analyst_upside` to emphasise *revisions/downgrades* over *target-upside levels*.

## Sources
- Bernard & Thomas PEAD; Martineau 2022 (PEAD decline); Frazzini & Lamont NBER w13090 (earnings-announcement premium)
- Womack 1996; Jegadeesh et al. 2004 (recommendation levels vs changes); analyst target-price accuracy/optimism studies
- Boehmer, Jones & Zhang (informed shorts); Lamont & Thaler (short-sale constraints); short-squeeze SI/DTC backtests; GameStop case study
- Novy-Marx 2013 (gross profitability); Fama & French 5-factor
- M&A target abnormal-return event studies; Dutordoir 2021 (declining target run-ups); merger-arb spread mechanics; FDA/clinical-trial event studies; CRL tail-risk
