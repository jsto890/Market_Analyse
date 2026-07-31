# Market Analyse UI Audit — Remediation Master Plan

> **For agentic workers:** This is the index. Do NOT implement from this file.
> Each phase has its own plan document with bite-sized TDD tasks.
> REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (fresh subagent per task, review between tasks) or `superpowers:executing-plans` (inline, batched with checkpoints).

**Source audit:** `/Users/josephstorey/Market_Analyse/MARKET_ANALYSE_UI_AUDIT.md` (564 lines, dated 2026-07-28)

**Goal:** Close every finding in the UI audit — ~130 issues across global chrome, rails, seven pages, the shared component system, accessibility, and the newly-shipped Options Live feature — without regressing the things the audit explicitly praises.

**Scope decisions (made by the user, 2026-07-28):**

| Question | Decision |
|---|---|
| Coverage | **Everything**, organised into phases (P0 → P1 → P2) |
| Test infrastructure | **Both** — RTL + jsdom for components, Playwright for routes/integration |
| New surfaces | Build **`/sources`** and the **glossary** page; **defer** the Settings page (G-14) |
| Market Review port (X-01) | **Out of scope** — different repo, different stack, tracked as a follow-up |

---

## Document map

| # | Document | Tasks | Owns |
|---|---|---|---|
| 00 | `00-foundations-contract.md` | — | **FROZEN INTERFACE CONTRACT.** Tokens, primitive prop types, `format.ts`, `labels.ts`, `storageKeys.ts`. Not a task list — the shared vocabulary every other phase is written against. |
| 01 | `01-phase0-test-infra.md` | 9 | Vitest project split, RTL + jsdom, Playwright, shared test helpers |
| 02 | `02-phase1-design-system.md` | **26** | Building the primitives + migrating every call site (UI-xx, X-xx, A11Y-xx) |
| 03 | `03-phase2-chrome-and-rails.md` | 27 | Nav, context strip, ⌘K, help overlay, shell, left/right rails (G-xx, LR-xx, RR-xx) |
| 04 | `04-phase3-today-and-ticker.md` | **23** | Today, Ticker detail, `/sources`, glossary (TD-xx, TK-xx) |
| 05 | `05-phase4-tables-and-crud.md` | 34 | Watchlist, Screener, Portfolio, Alerts (WL-xx, SC-xx, PF-xx, AL-xx) |
| 06 | `06-phase5-rotation-macro-charts.md` | 16 | Rotation, Macro, shared chart conventions (RO-xx, MC-xx, X-02) |
| 07 | `07-phase6-options-live.md` | 28 | Options hub, Strikes ladder, Options Live (OD-xx, OL-xx) |
| 08 | `08-reconciliation.md` | — | **CROSS-PHASE RULINGS.** File-collision matrix, shared-module ownership, execution order, coverage gaps. Read before executing any phase. |

**Total after reconciliation: 163 tasks** (was 173; ten duplicate tasks were deleted — see
`08-reconciliation.md` §A). The bolded counts are the ones that changed: Phase 1 loses
nine tasks, Phase 3 loses one.

---

## Dependency graph

```
Phase 0 (test infra)  ─────────────┐
                                   ├──► Phase 2 (chrome & rails)
00 contract ──► Phase 1 (design) ──┤──► Phase 3 (today & ticker)
                                   ├──► Phase 4 (tables & CRUD)
                                   ├──► Phase 5 (rotation, macro, charts)
                                   └──► Phase 6 (options live)
                                              ▲
                              Phase 5's chart-conventions spec ──┘
```

**Hard ordering:** Phase 0 → Phase 1 → **Phase 5 Tasks 1–2** → everything else.

Phase 5 Tasks 1–2 create `lib/chartConventions.ts` and `lib/rotation.ts` and touch no components. They are consumed by Phase 3 Tasks 1 and 19 and Phase 6 Task 5, so pulling them ahead of the parallel band removes the only cross-phase blocking dependency and costs nothing. (This supersedes the older "do Phase 5's spec section before Phase 6's chart tasks" note — the dependency is broader than Phase 6.)

Phases 2–6 are then mutually independent, subject to six intra-band ordering constraints listed in `08-reconciliation.md` §F.2. Verified parallel-safe pairings: 2‖4, 4‖6, 3‖6, 5(T3+)‖4.

**Pulling P0s forward:** Several Phase 6 Options Live findings (OL-01 route, OL-02 double ladder, OL-03 duplicated GEX column, OL-04 unmounted chart) are pure correctness bugs that do **not** depend on the design system. If the priority is "make the shipped feature work at all", those four can be executed straight after Phase 0. OL-09 (tokenisation) does depend on Phase 1.

---

## Known collisions and their rulings

The six phase documents were written by independent agents who could not see each other's
work. A final cross-phase review found **23 genuine collisions** — 14 source files and 9
test files claimed by two phases — plus 7 files needing an explicit ordering constraint.
All 23 are resolved. **`08-reconciliation.md` is the authority; where it disagrees with a
phase document, it wins.**

**Before executing any phase, apply that document's Appendix** — a per-file list of the
edits each phase doc needs (task deletions, scope reductions, `Create:` → `Modify:` flips,
citation fixes).

The rulings follow one principle: *Phase 1 owns mechanical primitive substitution; the page
phase owns behavioural change.* Where both did the same migration, Phase 1's task was
deleted. Net effect: **Phase 1 loses 9 tasks, Phase 3 loses 1, and 173 becomes 163.**

| Collision | Ruling |
|---|---|
| `app/layout.tsx` | P1 T9 → P2 T11; `UndoToastProvider` stays outermost |
| `today/SignalGroups.tsx` | **Delete P1 T23 + T24** — P3 was written against a pre-Phase-1 baseline and deletes the columns P1 glosses |
| `today/DiffStrip.tsx` | **Delete P3 T8** — P1 T25 also does the legacy-key migration |
| `today/RotationPanel.tsx` | **Delete P1 T32**; strip it from P3 T1; Phase 5 owns the file |
| `odte/VerdictCard.tsx` | **Delete P1 T26**; P6 T13 absorbs its A11Y-02 type-scale bump |
| `ticker/WhyPanel.tsx` | **Delete P1 T28**, **reduce P1 T27** to 3 steps; P3 T15 owns votes + inflation tip |
| `ticker/Header.tsx` | **Reduce P1 T29** — P3 T14 deletes the chips P1 was editing |
| `charts/CandleChart.tsx` | Split P1 T33 / P3 T19; chart-conventions compliance was orphaned and is assigned to P3 T19 |
| `app/screener/page.tsx` | **Delete P1 T21**; P4 T10 absorbs the `EmptyState` migration |
| `app/alerts/page.tsx` | **Delete P1 T22** — P4 T30 + T34 cover it entirely |
| `app/watchlist/WatchlistClient.tsx` | **Delete P1 T30**; **keep P1 T31** (format migration, not duplicated) |
| `app/portfolio/page.tsx` | **Delete P1 T35**; P4 T20/T22/T24 supersede |
| `lib/rotation.ts` | **Two creators.** P5 T2 is sole creator and absorbs `rotationSummary()` |
| `components/GexChart.tsx` | P6 T5 must use `format.compactNumber` + `CHART_HEIGHT`, not a local `formatYAxis` |
| 9 test files | Earlier phase creates, later phase modifies — see §A.3 |
| `lib/storageKeys.ts` | **Merge hotspot** — 6 tasks across 4 phases append to one object literal; append at the end, then `npm run test:lib -- storageKeys` |

Two defects were also found: **Phase 6 Task 5 re-declares a local 0dp `formatYAxis`** where
the contract says `format.compactNumber` (1dp) — a fresh instance of the very duplication
this plan exists to close — and **Phase 6 cites "Task 28" where it means Task 26** (twice).

A third, "Phase 4 Task 22 calls a nonexistent `fmtPrice()`", was **raised in review and then
disproved** — Task 22 declares the alias itself via `import { price as fmtPrice }`. It is
recorded as withdrawn in §D.2 so it is not re-raised. Do not change Task 22.

Five audit IDs had **no owning task** — `X-03` (locale/timezone), `G-10` (PageHeader
adoption), `A11Y-03` residual, `A11Y-06` residual, `MC-01` — each with a recommended owner
in `08-reconciliation.md` §E.1.

## Shared-module ownership

One owning task per module. A consuming phase may not redefine these; if it needs a
different shape it amends the owning task. Signatures in `08-reconciliation.md` §C.

| Module | Owner | Consumed by |
|---|---|---|
| `components/PageShell.tsx` | **P2 T10** | all page phases |
| `lib/useMarketClock.ts` | **P2 T6** | P3 |
| `lib/swr-visibility.ts` | **P2 T7** | P2, P3 |
| `lib/chartConventions.ts` | **P5 T1** | P3 T19, P5 T6–T16, P6 T5/T26 |
| `lib/rotation.ts` | **P5 T2** | P3 T1, P5 T6–T9 |
| `lib/useTickerData.ts` | **P3 T10** | P3 (also adds `QuoteData` to `types/argus.ts`) |
| `lib/levels.ts` | **P3 T11** | P3 |
| `components/today/DateStepper.tsx` | **P3 T2** | P3 |
| `components/odte/SymbolSwitcher.tsx` | **P6 T14** | P6 |

Not shared modules, despite appearances: `FxChip` (unexported, local to `LeftRail.tsx`),
`toneClass` (pre-existing export of `lib/macro.ts`, modified in place by P2 T18), and
`components/ui/PageHeader.tsx` (already in the repo — no phase creates it).

---

## Why the contract comes first

~40 of the audit's findings are variations on *"there are N implementations of one thing"* — four collapsibles (X-05), three pin affordances (X-04), three table implementations (PF-04), four loading vocabularies (WL-08), six re-declared button styles (UI-12), two label vocabularies (X-06/X-07).

Fixing those page-by-page would have each phase inventing its own primitive, which reproduces the exact problem the audit is complaining about. `00-foundations-contract.md` freezes one answer to each — exact prop types, exact function signatures, exact gloss copy — before any page work starts. **Every phase document is written against it. It is not open for renegotiation during implementation**; an implementing agent that disagrees should record the objection and implement as specified.

---

## Corrections to the audit found during planning

The audit is source-level and largely accurate, but planning agents verified each claim against the code and found errors. These corrections are already baked into the phase documents — **trust the phase docs over the audit where they disagree.**

1. **OL-01's suggested fix is wrong.** The audit's first suggestion is to create `app/api/options/live/[symbol]/route.ts`. Unnecessary. The backend route already exists (`argus/argus/api/routes.py:389`, `@app.get("/api/options/live/{symbol}")`) and the generic proxy already forwards `/api/argus/<path>` → `http://127.0.0.1:8088/api/<path>` with the query string preserved (`dashboard/app/api/argus/[...path]/route.ts:1`). The fix is one line in `lib/optionsLive.ts`.

2. **TK-07's combo decode is wrong.** The audit guesses the positional families are `trend / squeeze / oscillator / structure`. Verified against `argus/argus/action_card/builder.py`, the real 5-family order is `ma_trend, breakout, squeeze, momentum_osc, weekly_structure`, and only the first 4 characters are classified. Position 2 is `breakout`, not `squeeze`.

3. **PF-08's edge values are wrong.** The audit lists `HOLD`/`ADD` as separate values. Verified against `argus/argus/portfolio/tracker.py:56-69`, it is a single combined string `"HOLD/ADD"`, and there are three further states the audit never mentions: `"CONSIDER COVERING"`, `"N/A"`, `"NO DATA"`.

4. **A pre-existing blocker unrelated to the audit:** `dashboard/package.json` declares `"@types/vitest": "^0.34.6"`, which has been **unpublished from npm** and 404s any fresh `npm install` in `dashboard/`. The current `node_modules` works only because it predates the unpublish. Phase 0 Task 1 removes it — nothing else can install until it does.

### Corrections to the *contract* found during reconciliation

Four errors in `00-foundations-contract.md` itself, reported independently by downstream
planning agents, verified against source, and **already applied to the contract file**.
Full detail and the exact replacement text in `08-reconciliation.md` §B.

5. **`format.price` must not swallow `QuoteRow`.** `components/rails/QuoteRow.tsx:15-39` is deliberately instrument-aware — forex → 4dp, ≥1000 → thousands-separated 0dp, else 2dp, and never a `$` prefix. Migrating it to the contract's flat "2dp always, `$`-prefixed" rule is a visible regression. The contract now excludes `QuoteRow` explicitly (§C bullet + §F exclusion row). **No task migrates this file, and none should.**

6. **`app/portfolio/page.tsx` has no `fmtPct`.** The contract cited one; `grep` returns zero matches. The file's only numeric helpers are two bare `.toFixed(2)` call sites — `avg_cost` at `:190` (migrates to `format.price`, folded into Phase 4 Task 20) and `pos.score` at `:194` (a raw ensemble score, outside `format.ts`'s scope — stays as-is).

7. **`PORTFOLIO_EDGE_LABEL` targets the `edge` cell, not `verdictChip`/`scoreClass`.** Its six keys match `pos.edge`'s value set (`app/portfolio/page.tsx:197`) exactly and match none of `pos.verdict`'s. The contract's §F row was rewritten, and a separate `VERDICT_LABEL` row added for `verdictChip` (`:35-48`). `scoreClass` is a numeric-tone class, not a label concern — leave it.

8. **`HEADER_GLOSS` is ADDITIVE, not closed.** Phase 4 extended it freely while Phase 5 refused to and left four rotation headers unglossed — two phases, opposite readings of one contract section. The map now carries a docblock declaring it a floor rather than a ceiling (frozen: its *shape* and *location*; open: its entries), and gloss copy for `Industry` / `1W` / `1M` / `3M` was written against `sector_rotation.py` and added. Phase 5 Task 8's "did not hold up" caveat is void.

---

## Global constraints (apply to every task in every phase)

- **Never introduce raw Tailwind palette colours** (`bg-blue-500/30`, `text-green-300`, …) or hardcoded hex. Use the tokens in contract §A. The audit's OL-09 exists because this rule was not enforced.
- **Type-scale floor:** 11px minimum for data, 12px minimum for prose. No arbitrary sizes below 11px. Do not convey state with `opacity` — use a real muted colour token.
- **No new primitive without a contract entry.** If a task seems to need one, stop and flag it rather than inventing it locally.
- **Tests never require a live IBKR gateway, a live Argus API, or the real SQLite DB.** Mock at the fetch boundary using `mockFetchJson` from `@/test/fetchMock`.
- **Copy voice:** the audit's §18 singles out this product's intellectual honesty as its best quality — "consensus, not edge", "magnitude does not predict returns", "~72% of ±1 moves are noise", "advisory only", "context, not a mechanical exit system". Any new copy matches that register. Never overclaim predictive power. Where the fix is "make the caveat more visible", make it more visible — do not soften or delete it.
- **Python work** (a few backend fixes land in Phases 4 and 6) runs in `argus/.venv`, with pytest invoked from the `argus/` directory.
- **Commit per task.** Each task ends with a real commit; each task is independently reviewable.

---

## What the audit says to keep — do not regress these

Verbatim from audit §18, these are load-bearing and must survive every refactor:

- The token ladder in `globals.css` — five surfaces, semantic state colours, thin themed scrollbars, global `tabular-nums`, `prefers-reduced-motion` reset.
- Fira Sans / Fira Code with mono reserved for data.
- The intellectually honest copy (see above).
- `DataTable`'s expand-in-place and `j`/`k` navigation.
- `WhyPanel`'s degraded states (504 → "the ensemble is slow, not offline", stale chip, retry) — the audit calls this best-in-app error handling and says to use it as the template elsewhere.
- The "How to read this ladder" explainer on `/odte/strikes` — best explanatory content in the product; it needs promoting above the fold, not rewriting.
- Per-view state persistence — the right instinct for a daily-use local tool. It needs a visible reset, not removal.
- Existing correct a11y: global `*:focus-visible` outline, `aria-expanded`/`aria-controls` on `Panel` and the votes accordion, `aria-label`s on icon-only rail and delete buttons.

---

## Deferred / out of scope

| Item | Audit ID | Why |
|---|---|---|
| Settings page (risk, ports, thresholds, reset all stored prefs) | G-14, roadmap 25 | User deferred. `lib/storageKeys.ts` (contract §E) ships the `resetAllStoredPrefs()` registry now so the page is a thin follow-up. |
| Port Market Review dashboard to Argus tokens, unify taxonomy | X-01, roadmap 26 | Separate repo (`~/Market_Review`), separate stack, separate lifecycle. |
| Argus dev UI (`argus/argus/ui/index.html`) tokenisation | X-02 (partial) | Internal dev surface, not user-facing. Chart-convention work covers the user-facing charts. |
