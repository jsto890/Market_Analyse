# Obsidian Report Redesign

**Date:** 2026-06-10
**Scope:** Both daily reports — the Twitter Memo (`Market_Review/src/stock_chatter/memo.py`) and the Sentiment × Technical bridge (`Market_Analyse/sentiment_bridge.py`). Goal: cut noise, surface only what's used for picking long candidates, and make every column/line mean something.

---

## Goal

The reports are read each morning to (a) see where chatter is rotating and (b) pick long candidates. Strip everything that doesn't serve those two jobs. Make the bridge report explainable — show *why* a ticker is classified LONG so it can be sanity-checked rather than trusted blindly.

---

## Shared component: Family → Sub-sector taxonomy

Both reports classify tickers into a two-level **Family → Sub-sector** taxonomy. Single source of truth so the two codebases can't drift.

**Location:** `Market_Analyse/config/sector_taxonomy.yaml` (definition) + `Market_Analyse/config/sector_cache.json` (ticker → yfinance sector/industry cache). The memo (Market_Review) reads both by absolute path, mirroring the existing `MARKET_REVIEW_REPORT` cross-repo pattern.

**Resolution per ticker (in order):**
1. Explicit ticker→sub-sector override (for narrative buckets yfinance can't separate).
2. Else yfinance `industry` → sub-sector via an industry-name map.
3. Else "Other" with the raw industry string.

yfinance `sector`/`industry` are fetched once per ticker and cached in `sector_cache.json` (sectors rarely change). The bridge already has `card.sector`; the catalyst leg's `gather_pool` will also capture `industry`.

**Taxonomy (curated overlay — editable):**
```
AI / Compute
  Semiconductors           NVDA, AMD, MU, AVGO, QCOM, INTC, MRVL, CRDO*   (yf: Semiconductors)
  Semi Equipment           AMAT, LRCX, KLAC, ASML, AEHR                   (yf: Semiconductor Equipment & Materials)
  GPU / Datacenter Compute NBIS, CRWV, SMCI, DELL                         (override)
  Data Center REITs        EQIX, DLR                                      (override; yf: REIT-Specialty)
  IPPs / Power / Utility   VST, CEG, NRG, TLN                             (override; yf: Utilities)
  Networking / Optical     ANET, CRDO, LITE, COHR, AAOI                   (override)
Software
  Infrastructure / Security PANW, NET, CRWD, ZS, S                        (yf: Software-Infrastructure)
  SaaS / Application        CRM, DDOG, DOCN, NOW, DUOL                    (yf: Software-Application)
Quantum
  Quantum Computing        IONQ, RGTI, QBTS, QUBT                         (override)
Nuclear / Uranium
  Uranium Miners           CCJ, UEC, LEU, UUUU, DNN                       (override)
  SMR / Nuclear Tech       OKLO, SMR, NNE                                 (override)
Crypto
  Crypto Miners            IREN, MARA, CIFR, RIOT                         (override)
  Exchanges / Treasury     COIN, HOOD, MSTR                               (override)
Space / Defense
  Space                    RKLB, ASTS, LUNR, RDW, BKSY                    (override)
```
A ticker appears in exactly one sub-sector (no double-counting; e.g. OKLO → SMR/Nuclear Tech). `CRDO*` resolves to Networking/Optical via override even though yfinance calls it Semiconductors.

---

## Report 1 — Twitter Memo

**Remove every section except Sector Rotation.** Deleted: Top Talked-About Stocks, Reliable Account Chatter, News That Can Move Stocks, Areas To Watch, Account Leaderboard, Account Trust, Theme Map, Action Queue, Changed Since Last Run, Needs Confirmation, Data Freshness, Actionability Notes, setup sections.

**Sector Rotation** — grouped by Family, sub-sector is the rotation row. Rotation direction reuses the existing setup-label proxy (no time series needed):
- **↑ rotating in** = fresh_watch / building setups
- **→ running** = extended / late_chase
- **↓ cooling** = avoid_wait

Sub-sectors sorted within family by rotation heat (count of ↑ names, then →). Families ordered by total active interest.

```
## Sector Rotation
↑ rotating in · → running · ↓ cooling

AI / Compute
  Semiconductors           ↑ MRVL, MU       → AMD, TSM
  Semi Equipment           ↑ AEHR
  GPU / Datacenter Compute ↑ NBIS           → SMCI
  Networking / Optical     ↑ CRDO           → LITE, AAOI
Nuclear / Uranium
  Uranium Miners           → CCJ, UEC
  SMR / Nuclear Tech       ↑ OKLO           → SMR
```

---

## Report 2 — Sentiment × Technical × Fundamental

Rename the report to reflect all three legs. All three legs share the same −1..+1 signed scale (`sentiment_score`, `tech_score`, `catalyst_score`).

### Groups (two only — both are LONG candidates)

Bullish rules:
- **Technical bullish** = Argus verdict is `LONG`
- **Sentiment bullish** = `sentiment_score > 0.3`
- **Fundamental bullish** = `catalyst_score > 0`

- **Group 1 — Aligned (all three bullish):** verdict LONG AND sentiment > 0.3 AND fundamental > 0.
- **Group 2 — Technical + Fundamental bullish:** verdict LONG AND fundamental > 0 (sentiment not required; a ticker in Group 1 is not repeated in Group 2).
- Tickers with **no fundamental data** (`catalyst_score` empty — e.g. pure-technical force-includes) are **excluded from both groups**.

All other alignment categories (TECH_WAIT, DIVERGING, CONTRARIAN, NEUTRAL, shorts) are **dropped** from the report.

### Summary tables (one per group, lean)

```
## Aligned — Sentiment + Technical + Fundamental all bullish
| Ticker | Conviction | Sent | Tech | Fund | Combined | Sector |
|--------|-----------|------|------|------|----------|--------|
| AMD    | ⚡ STRONG  | 0.78 | 0.78 | 0.44 | +0.79    | AI / Compute → Semiconductors |

## Technical + Fundamental bullish
| Ticker | Conviction | Sent | Tech | Fund | Combined | Sector |
```

- **Conviction:** ⚡ STRONG if `high_conviction` (Argus ≥75% agreement), else ✅ GOOD.
- **Sent / Tech / Fund:** the three leg scores, 2dp, same −1..+1 scale.
- **Combined:** blended score, signed.
- **Sector:** Family → Sub-sector from the shared taxonomy. (Replaces the old raw-tag Catalysts column.)

### Long Candidate Detail

One block per long ticker (both groups pooled), ordered by combined score descending. Four lines:

```
### AMD — ⚡ STRONG (+0.79)
Returns        1D +5% · 1W −4% · 1M +8% · 6M +127% · 1Y +324%
Why technical   price>50>200DMA · MACD bull cross · RSI 62 rising · breakout 20d · vol surge 1.8×
Why fundamental rev +38% · margin 13% · analyst Buy, tgt +15% (41) · short 2.8% · DTC 1.2
Why catalyst    earnings in 8d · ⚡ contract win 3d ago · ⚠ dilution risk
```

- **Returns:** trailing context returns (the existing `ret_Nd` columns), colour-coded as today. Moved out of the summary table into here.
- **Why technical:** top 5 LONG-voting Argus agents by confidence, shown as their cleaned `note` text (raw agent names hidden). Reuses the existing `_distill_notes` ranking logic against `card.votes`.
- **Why fundamental (metrics only):** revenue growth, profit margin, analyst rating + target upside (+ # analysts), short %-float, days-to-cover — from the catalyst leg's `metrics`. Show whichever are present.
- **Why catalyst (events/flags only):** detected events with direction, **source detail**, and recency (`cat.events`), gate flags (`cat.flags`: ⚡ hard-positive, ⚠ DILUTION, ⛔ STRUCTURAL), and earnings proximity ("earnings in 8d"). Each event shows its short source snippet so the "who/what" is visible, e.g. `contract win — "AMD signs $5B datacenter deal with Oracle" (3d ago)`, `M&A rumour — "Reuters: X in talks to acquire Y"`, `FDA approval — "Phase 3 for [drug] met endpoint" (3d ago)`. Falls back to the bare label when no snippet exists. Shows "— none detected" when empty.

  **Required change to capture the snippet** (currently discarded): add a `detail: str = ""` field to `CatalystEvent` (`argus/catalyst/types.py`); in `classify.py` `_parse_events`, store the LLM's already-returned `source_snippet` into `detail`; in `keyword_fallback`, attach the matched headline text. The classifier prompt already requests `source_snippet` — only the parsing/storage is missing.

The split: **fundamentals are the metrics, catalysts are the events/flags/timing.**

### Footer note
```
_Entry/stop/target intentionally omitted pending a separate exit-analysis — to be added later._
```

### Removed from the bridge report
Per-ticker verbose detail blocks (old format), and the table columns: setup_label, tier/action_label, regime, entry_quality, quality_score, agreement_pct, argus_score, entry, stop, target, risk_reward. (Conviction badge + the three leg scores replace quality/score/agreement; entry/stop/target deferred.)

---

## Data availability (verified)
- `card.votes: List[Vote]` — all 70 technical agent votes (agent, verdict, confidence, note). ✓
- `_distill_notes(votes, verdict, limit)` — existing ranking by agreement+confidence. ✓
- `cat.votes` (5 sub-agents), `cat.events` (type/direction/recency — `detail` field to be added), `cat.flags` (gate flags), `cat.metrics` (rev growth, margin, analyst target/rating, short%, dtc, days_to_earnings). ✓
- `source_snippet` already produced by the Claude classifier prompt but discarded in `_parse_events`; only storage is missing. ✓
- `card.sector` (yfinance sector) present; `industry` to be added to `gather_pool`. ✓

## Out of scope
- Entry/stop/target levels (deferred to a future exit-analysis).
- Time-series rotation (using the fresh/building setup proxy instead).
- Catalyst intra-weight or top-level weight changes (separate workstream).
