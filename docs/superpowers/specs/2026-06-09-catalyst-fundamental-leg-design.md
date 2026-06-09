# Catalyst / Fundamental Leg — Design Spec

**Date:** 2026-06-09
**Status:** Approved design, pending implementation plan
**Component:** `argus/` package + `sentiment_bridge.py`

---

## 1. Overview

Add a **third decision leg** to the daily pipeline alongside the existing sentiment
(X chatter) and technical (Argus 70-agent ensemble) legs. The new leg scores each
ticker on **catalysts and fundamentals** — pooling free data sources, classifying
event news with Claude, and emitting both a weighted score and a set of hard gates.

Today the bridge blends two legs:
```
combined = 0.40·sentiment + 0.60·technical
```
After this change:
```
catalyst_score, gates = catalyst_leg(ticker)
combined = wS·sentiment + wT·technical + wC·catalyst   (weights renormalized over available legs)
combined = apply_gates(combined, gates)
```

### Motivation
The operator hunts pre-catalyst micro/small-caps (e.g. AMPG ~$166M) "lying in wait"
for a catalyst. Neither existing leg sees catalysts directly: technicals are pure
price/volume, sentiment only catches catalysts incidentally when they're tweeted.
A dedicated leg surfaces M&A, FDA decisions, contracts, collaborations, earnings
proximity, and squeeze setups — and gates out the dilution/offering events that kill
micro-cap runs.

---

## 2. Goals / Non-Goals

**Goals**
- A self-contained catalyst scoring module that produces a `−1..+1` meta-score, a
  typed catalyst list, and gate flags per ticker.
- Pool **free** data only: X-chatter catalyst tags, yfinance (`.info` + `.news`),
  IBKR `fundamentals()` + IBKR news functions.
- Use Claude (Haiku) to classify pooled news/chatter text into typed, direction-aware catalysts.
- Blend as a distinct third leg with independent weight + hard gates at bridge level.
- Degrade gracefully: missing data abstains (neutral), never penalizes — critical for micro-caps.
- Every catalyst signal is inspectable in the report + CSV.

**Non-Goals**
- No paid news/data APIs.
- No reworking of the Argus technical ensemble or the sentiment pipeline.
- No change to the existing `ALIGNED / DIVERGING / CONTRARIAN / TECH_WAIT / NEUTRAL`
  alignment taxonomy (that stays sentiment×technical; catalyst is additive).
- No valuation model for pre-revenue names (those abstain on the growth agent).

---

## 3. Architecture

Approach **B** (chosen over folding catalyst agents into the technical ensemble):
a **separate catalyst scoring module** with its own meta-score, blended as a third
leg in the bridge. Keeps clean 3-leg separation, independent weighting, and gates at
bridge level.

The module lives in the `argus/` package because that package already has:
- `IBKRClient` (`argus/data/ibkr.py`) — fundamentals + news access
- the `Vote` / agent pattern (`argus/agents/base.py`)
- the Anthropic client + key (`argus/settings.py`, pattern in `argus/chat/chart_chat.py`)

### Data flow (per ticker; runs for the ~22 bridged names, once/twice daily)
```
pool = {
  chatter_tags:  ticker_setups.csv  (catalysts, news_confirmation columns)
  yf_info:       yfinance .info      (PE, revenueGrowth, margins, shortPercentOfFloat,
                                      floatShares, targetMeanPrice, recommendationKey, earnings date)
  yf_news:       yfinance .news      (recent headlines)
  ibkr_fund:     IBKRClient.fundamentals()  (pe_ratio, eps_ttm, revenue_ttm, market_cap,
                                      analyst_target/rating, short_pct_float, dtc,
                                      earnings_date, days_to_earnings, 52w hi/lo)
  ibkr_news:     IBKRClient news functions (reqHistoricalNews/reqNewsArticle) [best-effort]
}
  → Claude Haiku classifies (yf_news + ibkr_news + chatter text)
       → typed catalysts: [{type, direction, recency, confidence, source}]
  → catalyst sub-agents vote (classified events + numeric fundamentals)
  → catalyst meta-score (−1..+1)  +  gate flags
```
The bridge consumes `(catalyst_score, typed_catalysts, gates)` and integrates them.

---

## 4. Data sources & coverage

| Source | Provides | Coverage notes |
|---|---|---|
| `ticker_setups.csv` (chatter) | `catalysts`, `news_confirmation` tags | Already computed daily; always available |
| yfinance `.info` | PE, revenueGrowth, profitMargins, shortPercentOfFloat, floatShares, targetMeanPrice, recommendationKey, earnings date | Free; **best micro-cap coverage**; primary numeric source |
| yfinance `.news` | recent headlines | Free; primary news-text source |
| IBKR `fundamentals()` | pe_ratio, eps_ttm, revenue_ttm, market_cap, analyst target/rating, short_pct_float, dtc, days_to_earnings, 52w hi/lo | Enrichment; subscription-dependent; returns `None` for many micro-caps |
| IBKR news functions | historical news headlines/articles | Best-effort; depends on account news-provider subscriptions |

**Precedence:** yfinance is the always-available floor for numeric + news. IBKR is
enrichment layered on top (when a field is present it overrides/augments yfinance).
Any source failing is caught and skipped; the dependent sub-agent abstains.

---

## 5. Catalyst leg — sub-agents

Each sub-agent mirrors the Argus agent contract: returns a vote
`(name, verdict ∈ {LONG, SHORT, WAIT}, confidence ∈ 0..1, note, family="catalyst")`.
Missing inputs → `WAIT` / `0.0` (abstain).

1. **event_catalyst** — consumes Claude's typed output. Positive types: acquisition/M&A
   target, FDA approval/acceptance/clearance, contract/award win, partnership/collaboration,
   product/clinical breakthrough, earnings beat, analyst upgrade, index inclusion.
   Negative types feed gates (§6), not this vote. Score scales with recency (fresher =
   stronger) and Claude's confidence.
2. **earnings_proximity** — `days_to_earnings`. Inside the window (≤14d) → mild LONG bias
   (pending catalyst / "lying in wait"); note records the date. Abstains if unknown.
3. **squeeze_setup** — `short_pct_float` + days-to-cover + float size. High short + low
   float = explosive fuel → LONG bias scaled by magnitude.
4. **growth_profitability** — revenue growth / margins / EPS trend. Pre-revenue or
   `None` → **abstain** (never penalize). Positive growth → LONG bias.
5. **analyst_upside** — analyst target mean vs current price + consensus rating. Material
   upside + buy-leaning consensus → LONG bias.

### Catalyst meta-score
Weighted aggregation of the sub-agent votes into `−1..+1`, following the existing
Argus meta-score convention (agreement × confidence weighting). Default intra-leg
weights (config constants, tunable):
```
event_catalyst       0.40
squeeze_setup         0.20
earnings_proximity    0.15
growth_profitability  0.15
analyst_upside        0.10
```
Abstaining agents are dropped and the remaining weights renormalized, so a name with
only an event catalyst still scores on that event.

---

## 6. Claude classification

- Model: `settings.meta_analyst_model` (`claude-haiku-4-5`), reusing
  `settings.anthropic_api_key` and the `anthropic.Anthropic(...).messages.create`
  pattern from `argus/chat/chart_chat.py`.
- Input: pooled, deduplicated headlines/snippets (yfinance news + IBKR news + chatter
  catalyst context) for one ticker, capped to a token budget (most-recent first).
- Output: strict JSON — a list of `{type, direction (+/−/neutral), recency_days,
  confidence, source_snippet}`. A fixed `type` enum is defined (acquisition, fda,
  contract, partnership, breakthrough, earnings_beat, earnings_miss, upgrade,
  downgrade, dilution, offering, going_concern, reverse_split, index_inclusion, other).
- Cost: ~22 calls/day, cents/day.
- **Fallback:** if the key is unset or the call fails, fall back to the existing
  chatter `catalysts` tags mapped onto the enum via keyword rules (deterministic).
  The leg still functions, at reduced fidelity — mirrors `chart_chat.py`'s
  templated fallback.

---

## 7. Hard gates (applied at bridge level, after the blend)

Gates act on Claude's negative/structural types and key thresholds:

| Gate | Trigger | Effect |
|---|---|---|
| **Dilution / offering** | fresh `dilution` / `offering` catalyst | Derank: cap combined to ≤0 (no LONG); flag `⚠ DILUTION` |
| **Going-concern / reverse-split** | `going_concern` / `reverse_split` | Veto LONG; flag |
| **Fresh hard positive** | fresh `fda` / `acquisition` / `contract` (high confidence) | Conviction boost + `⚡` flag |
| **Earnings imminent** | `days_to_earnings` ≤ 14 | Timing flag on report (no score change) |

Gates are evaluated in order; a veto/derank wins over a boost. All gate decisions are
recorded in the per-ticker output for inspection.

---

## 8. Bridge integration (`sentiment_bridge.py`)

- New config constants (top of file, next to `SENTIMENT_WEIGHT` / `TECHNICAL_WEIGHT`):
  ```
  SENTIMENT_WEIGHT = 0.35
  TECHNICAL_WEIGHT = 0.45
  CATALYST_WEIGHT  = 0.20
  ```
- Per ticker, after computing `sentiment_score` and `tech_score`, call the catalyst
  module to get `(catalyst_score, typed_catalysts, gates)`.
- **Weight renormalization:** if a leg is unavailable (e.g. catalyst pool empty →
  `catalyst_score is None`), renormalize the present legs' weights to sum to 1, so the
  absent leg neither helps nor hurts. With all three present, weights are 0.35/0.45/0.20.
- Apply gates to the blended `combined`.
- Alignment taxonomy unchanged; catalyst surfaces as new columns/flags only.

---

## 9. Report & CSV output

Add to `bridge_latest.md` table and `bridge_latest.csv`:
- `catalyst_score`
- `catalysts` — typed list (e.g. `fda+ , contract+`)
- `gate_flags` — e.g. `⚡` / `⚠ DILUTION` / `earnings≤14d`

A short "Catalysts" sub-line per ticker in the Markdown detail, consistent with the
existing inspectable-reasoning style.

---

## 10. Resilience

- Every source call is wrapped; failure → skip that source.
- Per-day on-disk cache keyed by `ticker + date` (under `argus`'s reports/cache area)
  so re-runs (06:15 + 08:00) don't refetch news/fundamentals or re-call Claude.
- Empty pool → catalyst leg returns `None` → weights renormalize to the 2-leg blend
  (today's behavior). A name with no news is **not** punished.
- Claude failure → keyword fallback (§6).
- IBKR offline → yfinance-only pool; still functional.

---

## 11. Testing

Following the existing `argus/tests/` style (offline/smoke, no network):
- Unit test each sub-agent with synthetic inputs incl. all-`None` (asserts abstain).
- Test the meta-score aggregator (weight renormalization on abstain).
- Test each gate trigger + precedence (veto beats boost).
- Test bridge weight renormalization across {3 legs, catalyst missing}.
- Mock IBKR / yfinance / Claude (no live calls in tests); a Claude-failure path test
  asserting the keyword fallback runs.

---

## 12. File-level change list

**New**
- `argus/argus/catalyst/__init__.py`
- `argus/argus/catalyst/sources.py` — pool gathering (chatter, yfinance, IBKR), per-day cache
- `argus/argus/catalyst/classify.py` — Claude Haiku classification + keyword fallback
- `argus/argus/catalyst/agents.py` — the 5 sub-agents (Vote contract)
- `argus/argus/catalyst/score.py` — meta-score aggregation + gate evaluation; public
  `catalyst_leg(ticker, *, setups_row, ibkr=None) -> CatalystResult`
- `argus/tests/test_catalyst.py`

**Modified**
- `argus/argus/data/ibkr.py` — add news helper (`historical_news(symbol)`) wrapping
  `reqHistoricalNews` / `reqNewsArticle` (best-effort, returns `[]` on failure)
- `sentiment_bridge.py` — weights, call `catalyst_leg`, renormalize, apply gates, emit columns
- `argus/argus/settings.py` — only if new tunables (windows/thresholds) are surfaced as settings

---

## 13. Defaults (all config constants, tunable)

| Constant | Default |
|---|---|
| Blend weights (S/T/C) | 0.35 / 0.45 / 0.20 |
| Earnings-proximity window | ≤ 14 days |
| Squeeze trigger | short ≥ 15% float **or** DTC ≥ 5 |
| Classifier model | `claude-haiku-4-5` |
| Intra-leg weights | event .40 / squeeze .20 / earnings .15 / growth .15 / analyst .10 |
| News pool cap | most-recent headlines within token budget |

---

## 14. Deferred / open

- Insider-buying and institutional-ownership agents — considered, deferred (data
  reliability for micro-caps is poor; revisit after the 5-agent leg proves out).
- Tuning of weights/thresholds after ~1 week of live runs.
- Optional later: catalyst recency decay curve refinement.
