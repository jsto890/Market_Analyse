# Session Handoff — Market Review × Argus pipeline

_Last updated: 2026-06-10_

A primer for the next session: what the system is, everything changed in the
2026-06-10 session, the sector-rotation methodology decision (RRG) with the
research behind it, and the open follow-ups.

---

## 1. System overview

Two repos feed one daily report:

- **`~/Market_Review`** (Python pkg `stock_chatter`, `PYTHONPATH=src`) — ingests X/Twitter
  sentiment from **three paths**: (1) curated followed accounts, (2) daily **broad
  cashtag + phrase search** across the full public timeline (`fetch_trending_cashtag_posts`
  → `discovery.select_candidates`, merged into the bridge via `--extra-tickers`), and
  (3) on-demand per-ticker cashtag search (`ticker_search.py`). All paths extract
  ticker signals, fetch prices, and **classify each ticker into a setup label**
  (`reports/ticker_setups.csv`, `reports/watchlist_memory.csv`). Account list is in the
  **gitignored** `src/stock_chatter/accounts_local.py`.
- **`~/Market_Analyse`** — `sentiment_bridge.py` reads `ticker_setups.csv`, runs each
  qualifying ticker through **Argus** (52-agent technical engine in `argus/`),
  adds a catalyst/fundamental leg, blends a score, and writes the daily report.
  `sector_rotation.py` builds the rotation panel.

**Output:** `~/Market_Analyse/reports/bridge_latest.md` → copied to Obsidian at
`~/Documents/Obsidian Vault/Finance/Market Reports/<DATE> Daily Report.md`.

**Daily driver:** `~/Market_Review/run_daily.sh` (launchd, 08:00). Steps: fetch-x →
extract-signals → fetch-prices → classify-setups → update-watchlist → broad
cashtag discovery → bridge → copy to Obsidian. On the **1st of the month** it also
runs `tools/label_efficacy.py`.

**Manual bridge run** (note: skips broad discovery, so fewer candidates than the daily run):
```bash
cd ~/Market_Analyse
MARKET_REVIEW_REPORT=~/Market_Review/reports/ticker_setups.csv python sentiment_bridge.py \
  --min-quality 5 --extra-tickers "SMR,CCJ,UEC,LEU,OKLO,UUUU,DNN,NNE,IONQ,RGTI,QBTS,QUBT,RKLB,ASTS,LUNR,RDW,BKSY,BWXT,SATL"
```
X fetches cost money; there's a **$1/day budget guard** (`--daily-budget-usd N` to raise).

### Report structure (current)
1. **Market regime** banner (SPY+QQQ → risk-on/off; chase entries ON/OFF).
2. **Sector Rotation** — RRG panel (see §3).
3. **Aligned — Sentiment + Technical + Fundamental all bullish** (group1).
4. **High conviction, pulling back** — high social conviction + weak sentiment + catalyst (dip-buys).
5. **Technical + Fundamental bullish** (group2; 🔸 near-aligned flagged).
6. **Long Candidate Detail** — per-ticker 2-col tables (Returns pills, Technicals, Fundamentals, Catalysts).

### Setup labels (Market_Review `setups.py`)
`noise` / `avoid_wait` / `fresh_watch` / `building` / `momentum_confirmed` /
`extended` / `late_chase`. Bridge actionable set = fresh_watch, building,
momentum_confirmed + (extended, late_chase **gated by market regime**).
Each ticker also carries a **`conviction`** field (high/med/low, signal-only) and
the watchlist tracks an **`entry_signal`** on the watch→breakout transition.

---

## 2. What changed this session (2026-06-10)

### Critical bug fixes
- **Weekly-indicator cache collision** (`argus/.../strategies.py`, commit `3739af0`):
  `_weekly_bars` was keyed on `(last_date, len(df))` with no ticker identity, so
  **every US ticker received the first ticker's weekly bars**. All weekly RSI/MACD/
  EMA/OBV/structure notes were wrong for all-but-one ticker. Key now fingerprints
  the close series. *This was the biggest bug — verified with a collision test._
- **NaN price-bar mislabeling** (`Market_Review/setups.py`, commit `3679a7e`):
  yfinance returned a trailing bar (2026-06-09) with volume but **NaN OHLC for
  ~96% of tickers**. The labeler read it as the latest price → NaN price context →
  ~426/442 tickers dumped into noise/avoid_wait by chatter alone (this is why
  "only one aligned ticker" and why AAOI with 74 mentions → avoid_wait). Fix:
  `_price_context` drops NaN-close bars. After fix: momentum_confirmed 0→18,
  building 4→24; bridge went 2→16 aligned. **Follow-up: also drop NaN bars at the
  fetch layer (`prices.py`) so scoring/backtest/dashboard are protected too.**

### Catalyst / fundamental leg
- EPS reconciliation: `earnings_beat`/`miss` flipped to match real `eps_surprise`
  (HIMS was showing a miss as a beat).
- Analyst events from yfinance `upgrades_downgrades` (firm + grade), dropping noisy
  keyword matches; suppress Buy→Buy reiterations.
- Real news timestamps from `content.pubDate` (commit `30b5097`) — fixed the fake
  "3d ago"; undated chatter events now show "recent".
- `$` escaped in table cells so Obsidian doesn't render EPS as LaTeX (`bc135cb`).

### Label methodology (backed by a forward-return backtest)
Backtest finding: `late_chase` (+23% median 20d) and `extended` (+10%) were the
**strongest** forward performers — hard-dropping them cut the best momentum.
`fresh_watch` was the weakest (dips first). `avoid_wait` conflates buyable
pullbacks-in-uptrends with broken downtrends (trend context separates them).
Implemented:
- Don't hard-drop extended/late_chase — **regime-gated** (commit `9dddbba`/`b89345a`).
- `fresh_watch` requires volume/price confirmation; `avoid_wait` has a trend-context
  guard (`Market_Review` `7717160`).
- **`conviction`** field + **`entry_signal`** transition + dated `entry_signals.jsonl`
  log for backtesting entry-on-transition (`49c2f71`).
- Surfaced conviction in the report (🟢/🟡/⚪), **near-aligned band** (🔸, softens the
  0.30 sentiment cliff), **High conviction pulling back** section.

### Regime gate + monthly backtest (`9dddbba`)
- Bridge runs Argus's regime detector on SPY+QQQ; chase labels included only when
  risk-on. `--no-chase` / `--force-chase` override. Shown in the report header.
- `tools/label_efficacy.py` — monthly forward-return backtest by first label,
  writes `docs/label_efficacy/`. Run on the 1st via `run_daily.sh`.

### Accounts
Added 8 new followed accounts to `accounts_local.py` (gitignored): `@PhotonBull`,
`@__Con_`, `@asklivermore`, `@retail_mourinho`, `@TW_trades_` (swing);
`@InTheAssembly`, `@QuiverQuant`, `@SignaTrading` (research). Started at moderate
weights — they calibrate from backtested hit-rate.

---

## 3. Sector rotation — methodology decision (RRG)

### How it evolved
Watchlist-label heuristic → data-driven constituent returns → traded-industries
filter + Quantum basket + top-50 → momentum-acceleration scalar → **RRG (current)**.

### Why RRG (three research agents — quant, data-scientist, research-analyst — all agreed)
The old scalar (`Rot = 1M − 3M/3`) measured **absolute momentum**, not rotation.
Rotation is **relative** — capital moving *between* sectors. Unanimous findings:
1. **Must be benchmark-relative** (else you just rank market beta; in a rally
   everything is "heating up"). → fixed: now relative to SPY.
2. **Cap-weighting made it a mega-cap tracker** — 6/11 industries had effective
   N<5 (Semis ≈ 49% NVDA, Software-Infra ≈ 61% MSFT). → fixed: now **equal-weighted**
   (breadth).
3. **RRG is the practitioner standard** (StockCharts/Bloomberg): a 2-D measure —
   RS-Ratio (relative-strength level) + RS-Momentum (is that strength accelerating)
   — with four quadrants. The **Improving** quadrant (weak but turning up) is the
   early rotation-in signal the scalar couldn't express.

### What's implemented now (`sector_rotation.py`, commit pending)
- Equal-weighted daily index per traded industry (+ Quantum basket) vs **SPY**.
- RS line → JdK **RS-Ratio** (double 10-period WMA) + **RS-Momentum** (10-period ROC),
  centred at 100.
- **Quadrant**: 🟢 Leading / 🔵 Improving / 🟡 Weakening / 🔴 Lagging.
- Ranked by composite `(RS-Ratio−100)+(RS-Momentum−100)`; columns: Quadrant,
  RS-Ratio, RS-Mom, 1W/1M/3M (context), **Δrank** (movement vs previous report,
  dated snapshots in `config/rotation_ranks.json`).
- Sanity check: Semis showed 🔴 Lagging despite +92%/3M — relative strength is
  decelerating (ran hard, now underperforming SPY). Uranium 🔵 Improving.

### RRG refinements (DONE — commit after RRG)
- **Small-basket shrinkage** — ranking score is shrunk toward the cross-sectional
  mean by basket size (`w = n/(n+5)`, James–Stein style), so thin baskets
  (uranium n=3, quantum n=7) can't top/bottom the board on a few names' noise.
  Displayed RS-Ratio/Mom are untouched — only rank order is size-adjusted. This
  supersedes explicit vol-normalisation (RS-Ratio is already scale-centred at 100).
- **Δrank hysteresis** — only moves of ≥2 positions are flagged (`_RANK_HYSTERESIS`);
  ±1 shuffles show `•` (the ~72%-noise finding).
- **Breadth column** — % of constituents above their 50-day MA (participation).
  Confirms whether a move is broad or one name; e.g. an Improving quadrant with 0%
  breadth is an unconfirmed signal.

### Still-deferred RRG items
- Benchmark: **SPY** (`_BENCHMARK`). Compared SPY vs QQQ — near-identical ranks
  (#1–#12 same, RS values within ~0.4) since the traded industries are largely
  QQQ's components. Kept SPY (broad market).
- **Thin industry coverage — DONE (screener backfill):** `_fetch_constituents` now
  tops up thin TRADED industries toward 50 via the yfinance screener
  (`EquityQuery` + `yf.screen`, primary US exchanges {NMS,NYQ,NGM,NCM,ASE} only,
  no OTC/foreign cross-listings). Counts went e.g. Electronic Components 31→50,
  Computer Hardware 22→43, Comm Equipment 32→46, Uranium 3→13. A few cap below 50
  where the clean US universe is genuinely smaller (Semi Equipment 32 — most are
  foreign like ASML/Tokyo Electron; **Uranium 13** — that's the whole liquid US
  uranium universe, can't reach 50 without OTC/foreign junk). Runs on the weekly
  cache refresh only.
- Membership look-ahead: today's top-N applied to trailing returns (mitigated by
  weekly cache + equal-weight; lock membership quarterly for full rigor).

---

## 4. Open follow-ups (next session)
1. **`prices.py` NaN-bar guard** — move/duplicate the NaN-close filter to the
   price-fetch/write stage so scoring/backtest/dashboard are protected (currently
   only `setups.py` is).
2. **RRG refinements** — DONE (shrinkage, Δrank hysteresis, breadth). Remaining:
   benchmark choice (SPY vs QQQ) and quarterly membership lock.
3. **Wire conviction into scoring** (currently display-only) — let high/low social
   conviction adjust the blend or gate candidates.
4. **Validate the regime gate** — it's an unvalidated binary; backtest "chase only
   when risk-on" vs always/never once a regime change occurs.
5. **Re-run `label_efficacy.py` monthly** — thresholds (`rel_volume≥1.2`, `r20≥15%`)
   are fit on one bullish regime, n=12–16 per actionable bucket. Re-tune across regimes.
6. **Label taxonomy redesign** (discussed, deferred): the labels conflate signal
   conviction × price stage on one axis. Cleaner model = 2 fields (stage + conviction)
   + entry-as-transition. `conviction` + `entry_signal` are step 1; merging
   fresh_watch+building and extended+late_chase is the remaining cleanup.

## 5. Gotchas
- Manual bridge runs **skip broad cashtag discovery** → far fewer candidates than the
  daily run. Use the daily run / add `--extra-tickers` for parity.
- yfinance is flaky: trailing NaN bars (see §2), occasional 401s, foreign tickers
  (SIVE→SIVE.ST alias in `TICKER_ALIASES`). All fetches are best-effort.
- `accounts_local.py` and the X budget guard live in Market_Review and are
  **gitignored / cost money** — don't commit account handles.
- Δrank/entry_signal compare to the **previous dated report**, so they're empty on
  first run and populate from the next day.
