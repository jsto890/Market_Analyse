# 08 — Reconciliation: cross-phase collision rulings

Final consistency review across the seven planning documents (`00`–`07`) in this
directory. The six phase docs were written by independent agents who could not see
each other's work; this document resolves the seams.

**Status: rulings, not observations.** Every entry below is an instruction to a human
or agent editing the phase docs. This document does *not* edit the phase docs itself —
apply the changes listed here before execution begins.

**Governing principle** (from the review brief): *Phase 1 owns mechanical primitive
substitution; the page phase owns behavioural change. Where both do the same mechanical
migration, delete it from one. Where a page phase rewrites a component Phase 1 also
migrates, the page phase does it once and Phase 1's task is reduced or removed. Where
order matters, it is stated explicitly.*

**Headline numbers**

| | |
|---|---|
| Genuine source-file collisions found | 14 |
| Test-file double-creation collisions found | 9 |
| Total genuine collisions resolved | **23 / 23** |
| Files needing an ordering constraint only (no edit) | 7 |
| Phase-1 tasks deleted | 9 (T21, T22, T23, T24, T26, T28, T30, T32, T35) |
| Phase-1 tasks reduced in scope | 2 (T27, T29) |
| Phase-3 tasks deleted | 1 (T8) |
| Contract fixes applied to `00-foundations-contract.md` | 4 |
| Task count before → after | 173 → **163** |

**Revised per-phase task counts:** P0 = 9, P1 = 26, P2 = 27, P3 = 23, P4 = 34, P5 = 16, P6 = 28. **Total 163.**

---

## Section A — File-collision matrix

### A.1 Summary table

Legend — **CONFLICT**: two phases make incompatible edits to the same region, a ruling is
required. **DUPLICATE**: two phases do the same mechanical change; one is deleted.
**LAYERING**: both edits are wanted, only the order matters.

| # | File | Phases (tasks) | Class | Ruling (one line) |
|---|---|---|---|---|
| 1 | `dashboard/app/layout.tsx` | P1 T9, P2 T11 | LAYERING | P1 T9 → P2 T11; P2 T11 preserves `UndoToastProvider` as outermost wrapper |
| 2 | `dashboard/components/today/SignalGroups.tsx` | P1 T23/T24, P3 T3–T6/T21 | CONFLICT | **Delete P1 T23 + T24**; P3 T3–T5 supersede; move `MicroBar.tsx` deletion into P3 T4 |
| 3 | `dashboard/components/today/DiffStrip.tsx` | P1 T25, P3 T8 | DUPLICATE | **Delete P3 T8**; P1 T25 supersedes (it also does the legacy-key migration) |
| 4 | `dashboard/components/today/RotationPanel.tsx` | P1 T32, P3 T1, P5 T6–T9 | CONFLICT | **Delete P1 T32**; strip RotationPanel edit from P3 T1; P5 T6–T9 own the file |
| 5 | `dashboard/components/odte/VerdictCard.tsx` | P1 T26, P6 T7/T13 | CONFLICT | **Delete P1 T26**; P6 T13 supersedes and must absorb the A11Y-02 type-scale bump |
| 6 | `dashboard/components/ticker/WhyPanel.tsx` | P1 T27/T28, P3 T10/T15/T24 | CONFLICT | **Delete P1 T28**; **reduce P1 T27** to 3 steps; P3 T15 owns votes + inflation tip |
| 7 | `dashboard/components/ticker/Header.tsx` | P1 T29, P3 T10/T14 | CONFLICT | **Reduce P1 T29** to PinToggle + dead-code deletion; P3 T14 removes the chips |
| 8 | `dashboard/components/charts/CandleChart.tsx` | P1 T33, P3 T11/T19, P5 spec | CONFLICT | Split: P1 T33 = tokens + log `Toggle`; P3 T19 = ARIA/crosshair/volume **+ chart-conventions addendum** |
| 9 | `dashboard/app/screener/page.tsx` | P1 T21, P4 T9–T17 | DUPLICATE | **Delete P1 T21**; P4 T10 absorbs the `EmptyState` migration |
| 10 | `dashboard/app/alerts/page.tsx` | P1 T22, P4 T26/T28–T34 | DUPLICATE | **Delete P1 T22**; P4 T30 + T34 fully cover it |
| 11 | `dashboard/app/watchlist/WatchlistClient.tsx` | P1 T30/T31, P4 T1–T8 | CONFLICT | **Delete P1 T30**; **keep P1 T31** (format migration, not duplicated) and make it the test-file creator |
| 12 | `dashboard/app/portfolio/page.tsx` | P1 T35, P4 T18–T24 | DUPLICATE | **Delete P1 T35**; P4 T20/T22/T24 supersede |
| 13 | `dashboard/lib/rotation.ts` | P3 T1, P5 T2 | CONFLICT (two creators) | **P5 T2 is sole creator** and absorbs `rotationSummary()`; P3 T1 becomes consume-only |
| 14 | `dashboard/components/GexChart.tsx` | P6 T5 (+ contract §F) | CONFLICT | P6 T5 must use `format.compactNumber` + `CHART_HEIGHT`; fix the "Task 28" citation to **Task 26** |

Test-file double-creations (A.3) and ordering-only files (A.4) follow the detailed
rulings.

---

### A.2 Detailed rulings

#### A.2.1 — `dashboard/app/layout.tsx` (P1 T9 / P2 T11) — LAYERING

Both tasks edit an overlapping line range in the root layout: P1 Task 9 at `:40-45`
(wrapping children in `<UndoToastProvider>` for the undo primitive, contract §B), P2
Task 11 at `:39-46` (inserting the persistent rail/shell structure).

**RULING — order only, no deletion.**
1. Execute **P1 T9 before P2 T11**.
2. **`02-phase1-design-system.md` Task 9**: unchanged.
3. **`03-phase2-chrome-and-rails.md` Task 11**: add to its Files block —
   *"Depends on Phase 1 Task 9. `<UndoToastProvider>` is already present by the time
   this task runs; keep it as the outermost wrapper inside `<body>`, with the shell
   nested inside it, so a toast raised from any page mounts above the rails. Line
   numbers in this task were written against the pre-Phase-1 file — re-anchor to the
   post-T9 content rather than trusting `:39-46`."*

Rationale: the undo toast must outlive route transitions and must not be clipped by the
rail's `overflow-y-auto`; provider outside shell is the only ordering that satisfies both.

---

#### A.2.2 — `dashboard/components/today/SignalGroups.tsx` (P1 T23, T24 / P3 T3–T6, T21) — CONFLICT

The most serious collision in the plan. P1 Task 23 migrates the file's local `InfoTip` to
the contract primitive and Task 24 adds `HEADER_GLOSS` entries for the `C` / `⚑` / `Cat`
columns and deletes `components/ui/MicroBar.tsx`. But **P3 Task 3 was written against a
pre-Phase-1 baseline** — it states the file "still declares a local
`function InfoTip({ text }: { text: string })`" and renames it to `LegacyInfoTip`, which
is only coherent if P1 T23 never ran. Worse, **P3 Task 4 deletes the `C` / `⚑` / `Cat`
columns outright** — the exact columns P1 T24 writes glosses for.

**RULING — delete both Phase 1 tasks.**
1. **`02-phase1-design-system.md`: DELETE Task 23 and DELETE Task 24.**
2. **`04-phase3-today-and-ticker.md` Task 3**: drop the `LegacyInfoTip` rename step — with
   P1 T23 deleted, the local `InfoTip` is still present and this task should replace it
   with the contract `InfoTip` directly (that was T23's intent; T3 now performs it).
3. **`04-phase3-today-and-ticker.md` Task 4**: absorb the deletion of
   `dashboard/components/ui/MicroBar.tsx` from P1 T24. Verified: `SignalGroups.tsx` is
   `MicroBar`'s only consumer, so the deletion is only safe *after* T4 removes the
   columns that render it. Add `- Delete: dashboard/components/ui/MicroBar.tsx` to T4's
   Files block.
4. **Coverage reassignment**: move the `UI-09`, `UI-10`, `UI-12`, `X-06`, `X-07`
   SignalGroups rows out of Phase 1's coverage table into Phase 3's, owned by T3–T5.
5. Order within Phase 3 is already correct: T3 → T4 → T5 → T6 → T21.

---

#### A.2.3 — `dashboard/components/today/DiffStrip.tsx` (P1 T25 / P3 T8) — DUPLICATE

Straight duplicate. Both migrate the strip's hand-rolled disclosure to the contract
`Collapsible` and its ad hoc localStorage key to `storageKeys`. P3 T8 adds nothing
behavioural; P1 T25 additionally handles the `dash:panel:diff` legacy-key migration
(read-old-write-new), which P3 T8 omits and which would silently reset every user's
expand state if the two were run in the wrong order.

**RULING — delete the Phase 3 task.**
1. **`04-phase3-today-and-ticker.md`: DELETE Task 8.**
2. Move audit ID **TD-11** from Phase 3's coverage table to Phase 1, owned by **P1 T25**.
3. Renumber Phase 3 tasks after 8, or leave a `Task 8 — (removed, see 08-reconciliation.md §A.2.3)`
   stub; the stub is preferred so cross-references inside the doc do not silently shift.

---

#### A.2.4 — `dashboard/components/today/RotationPanel.tsx` (P1 T32 / P3 T1 / P5 T6–T9) — CONFLICT

Three phases touch this file. P1 T32 does mechanical primitive substitution
(`DataTable`, `InfoTip`, tokens). P3 T1 modifies it while adding a rotation summary line
to `app/page.tsx`. P5 Tasks 6–9 **rewrite the panel wholesale** — quadrant scatter,
label-collision handling, per-quadrant ARIA, and the header-gloss pass — and their work
strictly subsumes P1 T32's substitutions.

**RULING — Phase 5 owns the file.**
1. **`02-phase1-design-system.md`: DELETE Task 32.**
2. **`04-phase3-today-and-ticker.md` Task 1**: remove the `RotationPanel.tsx` entry from
   its Files block entirely. T1 keeps only its `app/page.tsx` change (rendering the
   summary line) and now *consumes* `rotationSummary()` from `lib/rotation.ts` rather
   than creating it — see §A.2.13.
3. **`06-phase5-rotation-macro-charts.md` Task 8**: its "did not hold up" note says four
   headers (`Industry`, `1W`, `1M`, `3M`) were left unglossed because `HEADER_GLOSS` was
   read as a closed map. **Contract fix 4 removes that ceiling** and supplies the copy
   verbatim (see §B.4). T8 must now gloss all four.
4. Coverage: `RO-04` and the RotationPanel half of `UI-09` are owned by **P5 T8**;
   delete those rows from Phase 1 and Phase 3.
5. Order: P5 T6 → T7 → T8 → T9, all after P5 T1–T2.

---


#### A.2.5 — `dashboard/components/odte/VerdictCard.tsx` (P1 T26 / P6 T7, T13) — CONFLICT

P1 T26 does primitive substitution plus an A11Y-02 type-scale bump. P6 T7 restructures
the card's data flow; P6 T13 rewrites its presentation (verdict grammar, `whyItMatters`
copy, InfoTip attachment) and is a strict superset of P1 T26's substitutions — **except**
for the type-scale bump, which P6 T13 does not mention and would silently revert.

**RULING — delete the Phase 1 task, transplant the one unique step.**
1. **`02-phase1-design-system.md`: DELETE Task 26.**
2. **`07-phase6-options-live.md` Task 13**: absorb P1 T26's A11Y-02 step verbatim —
   *"bump `text-[10px]` → `text-[11px]` on the title eyebrow and the `whyItMatters`
   caption; no other type-scale changes in this file."* Add `A11Y-02` to T13's
   audit-findings-closed list.
3. Order: **P6 T7 → P6 T13** (T13 assumes T7's props shape).
4. Coverage: `OD-08` and the VerdictCard half of `UI-04` are owned solely by **P6 T13**.

---

#### A.2.6 — `dashboard/components/ticker/WhyPanel.tsx` (P1 T27, T28 / P3 T10, T15, T24) — CONFLICT

Four separate regions are contested:

| Region | P1 claim | P3 claim | Winner |
|---|---|---|---|
| `NetBar` → `CenterBar` (`:52-74`, `:95`) | T27 | — | **P1 T27** |
| dead `ScoreBar` import | T27 | — | **P1 T27** |
| `n_eff` chip tooltip (`:384`) | T27 | T15 keeps local `InfoTooltip` here | **P1 T27** (P3 T15 explicitly defers) |
| inflation tip (`:348`) | T27 | T15 | **P3 T15** |
| votes accordion (`:412-445`) | T28 | T15 (replaces body with `VoteSection`/`groupVotesByFamily`, Dissented first) | **P3 T15** |

P3 T15 replaces the `<div id={votesId} hidden={!votesOpen}>` body wholesale, so any P1
edit inside it is dead work that also creates a guaranteed merge conflict.

**RULING — delete one, reduce one.**
1. **`02-phase1-design-system.md`: DELETE Task 28** (TK-07 — P3 T15 supersedes).
2. **`02-phase1-design-system.md`: REDUCE Task 27** to exactly three steps: drop the dead
   `ScoreBar` import; `NetBar` → `CenterBar` at `:52-74` and `:95`; contract `InfoTip` on
   the `n_eff` chip at `:384`. **Remove its `:348` inflation-tip step and its `:412-445`
   votes-accordion step.**
3. **Coverage**: `UI-04` and `X-05` for WhyPanel move from Phase 1 to **P3 T15**;
   `TK-07` is owned solely by P3 T15.
4. Order: **P1 T27 → P3 T10 → P3 T15 → P3 T24.**

---

#### A.2.7 — `dashboard/components/ticker/Header.tsx` (P1 T29 / P3 T10, T14) — CONFLICT

P1 T29 does four things; **P3 T14 deletes two of the elements T29 edits** — the earnings
chip (`:187-203`) and the HC badge (`:249-264`) are removed from the header entirely.

**RULING — reduce the Phase 1 task.**
1. **`02-phase1-design-system.md`: REDUCE Task 29** to two steps: `PinButton` → contract
   `PinToggle` (`:66-119`, call site `:270`), and delete the now-dead local
   `InfoTooltip` (`:41-64`). **Delete its `:187-203` and `:249-264` steps.**
2. **`04-phase3-today-and-ticker.md` Task 14**: unchanged, but note in its Files block
   that `PinToggle` is already in place from P1 T29 and must be preserved.
3. Coverage: `TK-04` owned solely by **P3 T14**.
4. Order: **P1 T29 → P3 T10 → P3 T14.**

---

#### A.2.8 — `dashboard/components/charts/CandleChart.tsx` (P1 T33 / P3 T11, T19 / P5 spec) — CONFLICT + dangling reference

Three problems here:

- P1 T33 (hex → token migration, log-scale control → contract `Toggle`) and P3 T19
  (chart interaction/ARIA work) both rewrite the control row.
- **`06-phase5-rotation-macro-charts.md` §3 contains a dangling reference**: it says
  "CandleChart … fixed in Task 8", but Phase 5 Task 8 is the RotationPanel header-gloss
  task. There is no CandleChart task in Phase 5.
- Phase 5 §5 declares `CHART_HEIGHT` on CandleChart "in-scope", yet Phase 5's File
  Structure table has **no CandleChart row** — so chart-conventions compliance for this
  file is currently owned by nobody.

**RULING — split by concern and give the orphan to Phase 3.**
1. **`02-phase1-design-system.md` Task 33**: keep, scoped to the hex → token migration and
   the log-scale `Toggle` substitution only.
2. **`04-phase3-today-and-ticker.md` Task 19**: keep, scoped to range-pill and EMA-chip
   ARIA semantics, the crosshair OHLC readout, and the volume-pane label. **It must not
   touch the log toggle.**
3. **`04-phase3-today-and-ticker.md` Task 19 — addendum**: also make CandleChart
   chart-conventions compliant — `CHART_HEIGHT`, vertical gridlines off, colours via
   `resolveChartTokens()` from `@/lib/chartConventions`. This makes **P3 T19 depend on
   P5 T1**.
4. **`06-phase5-rotation-macro-charts.md` §3**: fix the dangling "fixed in Task 8"
   reference to *"CandleChart is out of Phase 5's task list; its conventions compliance
   is Phase 3 Task 19 (see 08-reconciliation.md §A.2.8)."*
5. Coverage: `TK-12` splits — the log-toggle half to **P1 T33**, the remainder to **P3 T19**.
6. Order: **P5 T1 → P1 T33 → P3 T11 → P3 T19.** (P5 T1 creates no component, only
   `lib/chartConventions.ts`, so pulling it forward is free — see §F.)

---

#### A.2.9 — `dashboard/app/screener/page.tsx` (P1 T21 / P4 T9–T17) — DUPLICATE

P4 T11 (Button + Input), T13 (PinToggle), and T15 (`format.pct`) each duplicate a step of
P1 T21, on a page P4 restructures anyway. The only P1 T21 step with no P4 counterpart is
the `EmptyState` migration at `:377-378`.

**RULING — delete the Phase 1 task, transplant the one unique step.**
1. **`02-phase1-design-system.md`: DELETE Task 21.**
2. **`05-phase4-tables-and-crud.md` Task 10**: absorb the `EmptyState` migration at
   `:377-378` and add `UI-10` to its audit-findings-closed list.
3. Coverage: `SC-06` → P4 T15, `SC-08` → P4 T13, `SC-09` → P4 T11; delete the duplicate
   rows from Phase 1's table.

---

#### A.2.10 — `dashboard/app/alerts/page.tsx` (P1 T22 / P4 T26, T28–T34) — DUPLICATE

P4 T30 (delete-undo via `useUndoAction`, AL-04) and P4 T34 (Input / Select / Button
substitution, AL-08) between them cover every step of P1 T22, on a page P4 rebuilds.

**RULING — delete the Phase 1 task.**
1. **`02-phase1-design-system.md`: DELETE Task 22.**
2. Coverage: `AL-04` → **P4 T30**, `AL-08` → **P4 T34**; delete both rows from Phase 1.
3. No transplant needed — nothing in P1 T22 is unique.

---

#### A.2.11 — `dashboard/app/watchlist/WatchlistClient.tsx` (P1 T30, T31 / P4 T1–T8) — CONFLICT

P1 T30 (primitive substitution) is fully covered by P4 T2 and P4 T5, which rebuild the
watchlist table. **P1 T31 is not duplicated**: it migrates `fmtPct` / `fmtPrice` /
`fmtDate` / `daysSince` / `sincePercent` to `format.price` / `format.pct` /
`format.relativeAge` (X-08), which no Phase 4 task performs.

**RULING — delete one, keep one, and fix the now-broken test-file reference.**
1. **`02-phase1-design-system.md`: DELETE Task 30.**
2. **`02-phase1-design-system.md`: KEEP Task 31**, but its Files block currently says the
   test file was *"created in Task 30"*. With T30 gone, **T31 becomes the creator** of
   `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx` — change its entry from
   `- Modify:` to `- Create:` and delete the "created in Task 30" clause.
3. **`05-phase4-tables-and-crud.md` Task 1**: change
   `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx` from **(create)** to
   **(modify)** — P1 T31 now creates it.
4. Coverage: `WL-01` → **P4 T2**; `X-08` (watchlist) → **P1 T31**.
5. Order: **P1 T31 → P4 T1 → P4 T2 → … → P4 T8.**

---

#### A.2.12 — `dashboard/app/portfolio/page.tsx` (P1 T35 / P4 T18–T24) — DUPLICATE

P4 T20 replaces the bespoke table with `DataTable`, T22 replaces the hand-rolled
`verdictChip()` with `<Badge variant="verdict">`, and T24 renders the edge cell as
`<Badge variant="edge">` with an `InfoTip` gloss. Every P1 T35 step lands inside a region
P4 rewrites.

**RULING — delete the Phase 1 task.**
1. **`02-phase1-design-system.md`: DELETE Task 35.**
2. **`05-phase4-tables-and-crud.md` Task 20**: fold in the `avg_cost` migration —
   `:190`'s bare `` `${pos.avg_cost.toFixed(2)}` `` becomes `format.price(pos.avg_cost)`
   inside the new column render. (`pos.score`'s `.toFixed(2)` at `:194` stays — it is a
   raw ensemble score, outside `format.ts`'s scope. See §B.2.)
3. Coverage: `PF-08` owned solely by **P4 T24**; delete the Phase 1 row.

---

#### A.2.13 — `dashboard/lib/rotation.ts` (P3 T1 / P5 T2) — CONFLICT: two creators of one path

Both tasks have `- Create: dashboard/lib/rotation.ts`. Their exports are disjoint —
P3 T1 exports `rotationSummary(rows: RotationRow[]): string`; P5 T2 exports
`QUADRANT_COLOR`, `deriveQuadrant`, `abbreviate`, `splitDegenerate`,
`computeLabelCollisions` — so whichever runs second overwrites the first.

`06-phase5-rotation-macro-charts.md` §2 already declares `lib/rotation.ts` "the ONE place"
the quadrant map is defined, which settles ownership.

**RULING — Phase 5 Task 2 is the sole creator.**
1. **`06-phase5-rotation-macro-charts.md` Task 2**: additionally export
   `rotationSummary(rows: RotationRow[]): string`, transplanted verbatim from P3 T1
   (including its unit test).
2. **`04-phase3-today-and-ticker.md` Task 1**: change `lib/rotation.ts` from
   **(create)** to **consume-only** — remove it from the Files block. T1 now modifies
   `dashboard/app/page.tsx` only, importing `rotationSummary` from `@/lib/rotation`.
3. Order: **P5 T1 → P5 T2 → P3 T1.** This is the single cross-phase serialisation
   constraint that is easy to miss; see §F.
4. Test file: `dashboard/lib/__tests__/rotation.test.ts` — created by **P5 T2** (note the
   `__tests__/` path correction in §A.3).

---

#### A.2.14 — `dashboard/components/GexChart.tsx` (P6 T5 vs contract §F) — CONFLICT + citation error

Two defects:

- **P6 T5 re-declares a local `formatYAxis` at 0 decimals**, contradicting contract §F,
  which routes large-number axis formatting to `format.compactNumber` (1 decimal). Left
  as written, the plan ships a fresh instance of the exact X-08 duplication it is meant to
  close, and the GEX axis would disagree with every other compact number in the app.
- **P6's header and P6 T5 both cite "Task 28"** for the chart-conventions re-check. Task 28
  is the expiry control (OL-20). The chart task is **Task 26** (OL-18).

**RULING.**
1. **`07-phase6-options-live.md` Task 5**: delete the local `formatYAxis`; use
   `format.compactNumber` for the Y axis and `CHART_HEIGHT` from `@/lib/chartConventions`.
   This makes **P6 T5 depend on P5 T1 and P1 T2** (`lib/format.ts`).
2. **`07-phase6-options-live.md`**: correct both "Task 28" references (doc header and
   Task 5 body) to **Task 26**.
3. Also in that doc's File Structure table: delete the bogus path
   `dashboard/argus/argus/options_live/models.py` — no such file exists; the intended
   path is `argus/argus/options_live/models.py`.

---

### A.3 Test-file double-creation

Nine test files are marked `- Create:` by two different tasks. Whichever runs second
overwrites the first's cases. In every case the ruling is the same shape: the earlier
phase creates, the later phase modifies.

| Test file | Creator (keep `Create:`) | Change to `Modify:` in | Note |
|---|---|---|---|
| `dashboard/components/ui/__tests__/Badge.test.tsx` | **P0 T6** | P1 T14, **P4 T24** | P1 T14 already says modify; P4 T24 must too (it adds `variant="edge"`) |
| `dashboard/components/ui/__tests__/DataTable.test.tsx` | **P1 T19** | **P3 T6** | |
| `dashboard/components/ticker/__tests__/WhyPanel.test.tsx` | **P1 T27** | **P3 T15** | |
| `dashboard/components/ticker/__tests__/Header.test.tsx` | **P1 T29** | **P3 T14** | |
| `dashboard/components/charts/__tests__/CandleChart.test.tsx` | **P1 T33** | **P3 T11** | P3 T19 also modifies |
| `dashboard/components/rails/__tests__/MacroGauges.test.tsx` | **P2 T18** | **P5 T16** | |
| `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx` | **P1 T31** | **P4 T1** | See §A.2.11 — creator moved from the deleted T30 |
| `dashboard/lib/rotation.test.ts` → **`dashboard/lib/__tests__/rotation.test.ts`** | **P5 T2** | — | **Path correction**, see below |
| `dashboard/lib/chartConventions.test.ts` → **`dashboard/lib/__tests__/chartConventions.test.ts`** | **P5 T1** | — | **Path correction**, see below |

**Path correction (P5 T1, T2).** `01-phase0-test-infra.md` states the convention:
*"Co-locate tests … under a `__tests__/` folder, matching the existing `lib/__tests__`
convention."* Phase 5 is the only doc that writes bare `lib/*.test.ts` paths. Correct both
in `06-phase5-rotation-macro-charts.md` (Task 1 and Task 2 Files blocks, and the doc's
File Structure table) to sit under `dashboard/lib/__tests__/`. Left uncorrected the files
still run — the vitest `lib` project globs both — but they break the one-location
convention Phase 0 establishes and future greps for tests will miss them.

---

### A.4 Safe sequential layering (ordering constraint only)

Both edits are wanted; neither is deleted. These need an explicit order recorded in the
phase docs so an agent does not re-anchor line numbers against a stale baseline.

| File | Required order | Why |
|---|---|---|
| `dashboard/components/ui/DataTable.tsx` | **P1 T19 → P3 T6** | T19 creates the primitive; T6 adds sticky-header / density behaviour on top |
| `dashboard/components/ui/Badge.tsx` | **P1 T14 → P4 T24** | T24 adds the `edge` variant to the union T14 defines (see §D.1) |
| `dashboard/lib/labels.ts` | **P1 T3 → P4 T14, P5 T8** | T3 creates `HEADER_GLOSS`; both later tasks append entries (map is ADDITIVE, contract fix 4) |
| `dashboard/lib/storageKeys.ts` | **P1 T4 → P2 T4, P3 T16, P4 T7, P4 T17, P6 T21, P6 T28** | **Merge-conflict hotspot — six tasks across four phases append to one object literal.** See mitigation below |
| `dashboard/components/rails/MacroGauges.tsx` | **P2 T18, T21 → P5 T16** | P2 owns the rail's structure and `toneClass`; P5 T16 applies chart conventions to the gauges |
| `dashboard/components/ticker/SentimentCard.tsx` | **P1 T34 → P3 T12** | mechanical then behavioural, per the governing principle |
| `dashboard/e2e/routes.spec.ts` | **P0 T7, T8 → P6 T1** | P0 T8 lands the `test.fail`-marked OL-01 case; **P6 T1 flips it to a passing assertion** and must not be run before it exists |

**`storageKeys.ts` mitigation (mandatory).** Six tasks in four independently-executed
phases append to the same object literal. Each task must:
1. append **at the end of the relevant nested object**, never mid-literal, and never
   reformat surrounding lines;
2. run `npm run test:lib -- storageKeys` immediately after merging, before continuing.

This makes every collision a trivial append-append conflict rather than a semantic one.
The keys themselves are disjoint across the six tasks — verified, no key is claimed twice.

---

## Section B — Contract fixes applied

Four errors in `00-foundations-contract.md` were reported independently by downstream
agents. All four were verified against real source, and **all four fixes are already
applied to the contract file** (1021 → 1042 lines). This section records what changed and
where, so the edits are auditable without diffing.

### B.1 — `format.price` vs `QuoteRow.formatPrice` (VERIFIED, contract was over-broad)

**Claim:** the contract's "Price: 2 decimals always, `$142.37`" rule conflicts with
`dashboard/components/rails/QuoteRow.tsx`.

**Verified against source.** `QuoteRow.tsx:15-39` `formatPrice(symbol, price)` is
instrument-aware — forex (`*=X`) → 4dp, `>= 1000` → thousands-separated 0dp, else 2dp —
and **never** prefixes `$`, per its own in-file spec comment. `:42-45` `formatPct` is 2dp
signed. Migrating either to `format.*` would be a visible regression: forex quotes lose 2
significant decimals, index quotes gain a spurious `$` and false precision, every rail %
loses a decimal.

**Fix applied — §C price bullet** now reads:

> **Price:** 2 decimals always (`$142.37`), regardless of magnitude. **This deliberately
> does *not* match `components/rails/QuoteRow.tsx`'s local `formatPrice(symbol, price)`**,
> which is instrument-aware (forex → 4dp, ≥1000 → thousands-separated with 0dp, else 2dp)
> and never prefixes `$`. `QuoteRow` is excluded from this migration — see §F.

**Fix applied — §F migration table** gained an explicit exclusion row:

> | **NOT** `format.price`/`format.pct` | `components/rails/QuoteRow.tsx:15-39` (`formatPrice`), `:42-45` (`formatPct`) | **Excluded by design.** Instrument-aware forex-4dp / ≥1000-0dp / no-`$` grammar; migrating is a visible regression. See §C. |

**Consequence for the phase docs:** none — no task currently migrates `QuoteRow`, and per
the contract none should. The exclusion is now stated rather than implied.

### B.2 — `app/portfolio/page.tsx` has no `fmtPct` (VERIFIED, contract cited a helper that does not exist)

**Verified against source.** `grep -n "fmtPct" dashboard/app/portfolio/page.tsx` returns
**zero matches**. The file's only numeric helpers are two bare `.toFixed(2)` call sites:
`avg_cost` at `:190` and `pos.score` at `:194`.

**Fix applied — §C migration paragraph** now carries the exclusion note in full, and
**§F** gained:

> | **NOT** `format.pct` | `app/portfolio/page.tsx` | **No `fmtPct` exists in this file** (verified — zero grep matches). Earlier draft error. `pos.score`'s `.toFixed(2)` is a raw ensemble score, outside `format.ts`'s scope; leave it. |

and the `format.price` row was corrected to cite `app/portfolio/page.tsx:190`
(`avg_cost` bare `.toFixed(2)`) rather than a nonexistent `fmtPct`.

**Consequence for the phase docs:** the `avg_cost` → `format.price` migration folds into
**P4 T20**'s column render (see §A.2.12). `pos.score` stays on `.toFixed(2)`.

### B.3 — `PORTFOLIO_EDGE_LABEL` targets the `edge` cell, not `verdictChip`/`scoreClass` (VERIFIED)

**Verified against source.** `app/portfolio/page.tsx` declares `edge?: string` at `:17`
and renders `{pos.edge ?? "—"}` at `:197`. The contract's six `PORTFOLIO_EDGE_LABEL` keys
(`HOLD/ADD`, `CONSIDER SELLING`, `CONSIDER COVERING`, `NEUTRAL`, `N/A`, `NO DATA`) match
`pos.edge`'s value set exactly and match **none** of `pos.verdict`'s
(`LONG` / `SHORT` / `WAIT`). The earlier draft named `verdictChip` (`:35-48`) and
`scoreClass` (`:50`) as the targets, which was wrong on both counts.

**Fix applied — §F** row rewritten, plus a new row separating the genuinely-related
concern:

> | `labels.PORTFOLIO_EDGE_LABEL` | `app/portfolio/page.tsx:197` — the `edge` cell (`{pos.edge ?? "—"}`) | bare uppercase string, no gloss. **Not** `verdictChip`/`scoreClass` (an earlier draft named those) … |
> | `labels.VERDICT_LABEL` | `app/portfolio/page.tsx:35-48` (`verdictChip`), `:192` (its call site) | `verdictChip` is a hand-rolled re-implementation of `Badge variant="verdict"`; the verdict cell is colour-only with no gloss. `scoreClass` (`:50`, `:193`) is a numeric-tone class, **not** a label concern — leave it. |

**Consequence for the phase docs:** confirms the §A.2.12 split — **P4 T22** owns
`verdictChip` → `<Badge variant="verdict">`, **P4 T24** owns the edge cell +
`PORTFOLIO_EDGE_LABEL` gloss (PF-08). `scoreClass` is out of scope for both.

### B.4 — `HEADER_GLOSS` is ADDITIVE, and the four missing rotation glosses (VERIFIED inconsistency, copy written)

**The inconsistency:** Phase 4 Task 14 freely adds `L` / `S` / `W` / `HC` / `Agree%` /
`R:R` glosses to `HEADER_GLOSS`, while Phase 5 Task 8's "did not hold up" note treats the
map as **closed** and therefore leaves four rotation headers (`Industry`, `1W`, `1M`,
`3M`) unglossed. Two phases, opposite readings of the same contract section.

**Fix applied (a) — §D `HEADER_GLOSS` docblock**, declaring the map additive:

```ts
/**
 * Today/Screener/Rotation table header glosses (X-06/X-07, TD-05, RO-04).
 *
 * **This map is ADDITIVE, not closed.** The entries below are the floor, not the
 * ceiling: a downstream phase that needs a gloss for a header not listed here
 * adds one (same voice, same honesty register) rather than falling back to a bare
 * unexplained header or inventing a second gloss map. What is frozen is the
 * *shape* (`Record<string, string>`, keyed by the header's literal rendered text)
 * and the *location* (this file — never a page-local constant).
 * Phase 4 Task 14 adds Screener's `L`/`S`/`W`/`HC`/`Agree%`/`R:R` on this basis.
 */
export const HEADER_GLOSS: Record<string, string> = {
```

**Fix applied (b) — four new entries**, appended after `Δrank`. Copy written against
`sector_rotation.py` as ground truth (`_TOP_N = 50`; `_returns_from_index()` at `:230-237`
returns **trailing, absolute** % returns of an equal-weighted industry index, *not*
benchmark-relative; `r1w`/`r1m`/`r3m` mapped from `ret["1W"]/["1M"]/["3M"]` at `:446-448`).
Recorded here verbatim:

```ts
  Industry: "Industry basket — a yfinance industry group, or a hand-built theme basket where no native industry exists. Equal-weighted across up to 50 US-listed constituents, so breadth drives it, not the largest name.",
  "1W": "Trailing 1-week % change of this industry's equal-weighted basket. Absolute price return, not relative to the benchmark — RS-Ratio is the relative measure.",
  "1M": "Trailing 1-month (~21 session) % change of the equal-weighted basket. Absolute, not benchmark-relative. Context for the quadrant, not a forecast.",
  "3M": "Trailing 3-month (~63 session) % change of the equal-weighted basket. Absolute, not benchmark-relative. A long window will lag a quadrant that has only just turned.",
```

**Consequence for the phase docs:** **`06-phase5-rotation-macro-charts.md` Task 8** must
delete its "did not hold up" caveat and gloss all four headers using the copy above; the
`RO-04` "ceiling" limitation recorded in that doc's closing section is removed.

---

## Section C — Shared-module ownership

Every module created by one phase and consumed by another, with a single owning task and
its exported signature frozen at that point. A consuming phase may not redefine any of
these; if it needs a different shape, it amends the owning task.

| Module | **Owning phase + task** | Exported signature (frozen) | Notes |
|---|---|---|---|
| `dashboard/components/PageShell.tsx` | **P2 T10** | `PageShell({ width?: "reading" \| "dense", children: ReactNode })` — `reading` = `max-w-5xl`, `dense` = `max-w-[1400px]`; owns its own `overflow-y-auto` | Closes G-08 (partial) and G-09. No competing definition in any phase. |
| `dashboard/lib/useMarketClock.ts` | **P2 T6** | `useMarketClock(): { us: UsMarketState; futures: FuturesMarketState }`, 30 s `setInterval` | Closes G-05. Phase 3 consumes it and does **not** define a competing clock. |
| `dashboard/lib/swr-visibility.ts` | **P2 T7** | `visibilityAwareInterval(ms: number): number` — returns `0` when `document.hidden` | Closes G-13. Same task also adds `updatedAt` to `useRailQuotes`. |
| `dashboard/lib/chartConventions.ts` | **P5 T1** | `ChartTokens`; `resolveChartTokens(el?: HTMLElement): ChartTokens`; `hexWithAlpha(hex: string, alpha: number): string`; `CHART_HEIGHT = "clamp(320px, 42vh, 640px)"`; `CHART_AXIS_STYLE` | **Most widely consumed new module.** Recharts (SVG) may pass `var(--x)` directly; lightweight-charts (Canvas 2D) must use `resolveChartTokens()`. Consumed by P3 T19, P5 T6–T16, P6 T5/T26. |
| `dashboard/lib/rotation.ts` | **P5 T2** (see §A.2.13) | `QUADRANT_COLOR`; `deriveQuadrant`; `abbreviate`; `splitDegenerate`; `computeLabelCollisions`; **+ `rotationSummary(rows: RotationRow[]): string`** transplanted from P3 T1 | Was double-created. Phase 5 §2 already declares this "the ONE place" the quadrant map lives. P3 T1 is now consume-only. |
| `dashboard/lib/useTickerData.ts` | **P3 T10** | `useTickerData(ticker: string): { quote: SWRResponse<QuoteData>; actionCard: SWRResponse<ActionCardData>; fundamentals: SWRResponse<FundamentalsData> }` | Closes TK-18. Same task also modifies `dashboard/types/argus.ts` — adds `QuoteData`, adds `name` to `FundamentalsData`. Any phase needing those types depends on P3 T10. |
| `dashboard/lib/levels.ts` | **P3 T11** | `DerivedLevels { entry; stop; target; stop_anchor; risk_reward; source: "live" \| "bridge" }`; `deriveLevels(bridgeRow, card): DerivedLevels`; `levelsToChartLevels(d: DerivedLevels): Level[]` | Same task also creates `dashboard/components/ticker/TickerChartSection.tsx`. |
| `dashboard/components/today/DateStepper.tsx` | **P3 T2** | `DateStepper({ dates: string[]; current: string \| null })` — pushes `?date=` | No competitor. |
| `dashboard/components/odte/SymbolSwitcher.tsx` | **P6 T14** | `SymbolSwitcher({ active: OdteSymbol; onChange: (symbol: OdteSymbol) => void; className?: string })` | No competitor. |

### C.1 — Things that look like shared modules but are not

Flagged because a reader scanning Files blocks will otherwise assume a second owner exists.

| Name | Reality |
|---|---|
| `FxChip` (P2 T19) | **Not a shared module.** Unexported, local to `components/rails/LeftRail.tsx`. Renders `FX · {STATE}` in `bg-elevated text-muted`. Do not lift it to `components/ui/`. |
| `toneClass` (P2 T18) | **Not new.** Already an export of `dashboard/lib/macro.ts`; P2 T18 modifies it in place (`text-accent`/`text-warn` → `text-pos`/`text-neg`). P5 T16 consumes the modified version — hence the P2 T18 → P5 T16 ordering in §A.4. |
| `components/ui/PageHeader.tsx` | **Pre-existing in the repo**, already used by screener / alerts / portfolio / `WatchlistClient`. Phase 5 reuses it as-is for `/rotation` and `/macro`. No phase creates it; see also the G-10 gap in §E.1. |

### C.2 — Duplicate-purpose pairs

Only one genuine duplicate-purpose pair exists after the §A rulings:

- **`rotationSummary` (P3 T1) vs `lib/rotation.ts` (P5 T2)** — same file, disjoint exports,
  resolved in §A.2.13 by merging into P5 T2.

No other pair of modules in the plan serves the same purpose under two names. In
particular `lib/chartConventions.ts` (P5 T1) and `lib/format.ts` (P1 T2) are
complementary, not overlapping: conventions owns colour/height/axis-style, `format` owns
number-to-string. The one place they were confused is P6 T5's local `formatYAxis` —
see §A.2.14.

---

## Section F — Recommended execution order

### F.1 — The order

```
1.  Phase 0            (9 tasks)   — test infra. Blocks everything.
2.  Phase 1            (26 tasks)  — design system + primitives. Blocks all page phases.
3.  Phase 5 Tasks 1–2  (2 tasks)   — lib/chartConventions.ts + lib/rotation.ts ONLY.
4.  Parallel band:  Phase 2  ‖  Phase 3  ‖  Phase 4  ‖  Phase 5 T3–T16  ‖  Phase 6
```

**Why Phase 5 T1–T2 are pulled forward.** Neither task touches a component — T1 creates
`lib/chartConventions.ts`, T2 creates `lib/rotation.ts`. Between them they are consumed by
P3 T1 (`rotationSummary`), P3 T19 (CandleChart conventions), P5 T6–T16, and P6 T5/T26.
Pulling them ahead of the parallel band removes the only cross-phase blocking dependency
in the plan and costs nothing — they are pure additions with no collisions.

**The parallel band is genuinely parallel** once T1–T2 have landed. Phases 2, 3, 4, 5
(T3+) and 6 own disjoint page trees. The five intra-band constraints below are the
complete list.

### F.2 — Intra-band constraints (the complete list)

| Constraint | Reason |
|---|---|
| **P2 T11 after P1 T9** | `app/layout.tsx` — preserve `UndoToastProvider` as outermost wrapper (§A.2.1) |
| **P3 T1 after P5 T2** | `lib/rotation.ts` — P5 T2 is sole creator (§A.2.13) |
| **P3 T19 after P5 T1** | CandleChart chart-conventions addendum needs `resolveChartTokens` (§A.2.8) |
| **P5 T16 after P2 T18** | `MacroGauges.tsx` + `toneClass` (§A.4, §C.1) |
| **P6 T1 after P0 T8** | `e2e/routes.spec.ts` — P6 T1 flips P0 T8's `test.fail` OL-01 case to passing (§A.4) |
| **P6 T5 after P5 T1 and P1 T2** | GexChart needs `CHART_HEIGHT` + `format.compactNumber` (§A.2.14) |

Plus the serialisation discipline on `dashboard/lib/storageKeys.ts` (§A.4): six tasks in
four phases append to one object literal — append at the end of the relevant nested
object, then run `npm run test:lib -- storageKeys` before continuing.

### F.3 — What must serialise, and what does not

**Must serialise:**
- Phase 0 → Phase 1 → everything. Non-negotiable: Phase 1 defines the primitives and
  `lib/format|labels|storageKeys` that all five page phases import.
- P5 T1–T2 before P3 T1, P3 T19, P6 T5.
- The six pairs in F.2.

**Explicitly parallel-safe (verified, no shared files after the §A rulings):**
- **Phase 2 ‖ Phase 4** — fully disjoint. P2 owns chrome/rails, P4 owns
  watchlist / screener / portfolio / alerts. No file appears in both after P1 T21/T22/T30/T35
  are deleted.
- **Phase 4 ‖ Phase 6** — fully disjoint (tables/CRUD vs 0DTE/options-live).
- **Phase 3 ‖ Phase 6** — disjoint after §A.2.8 (CandleChart is P3-only, GexChart is P6-only).
- **Phase 5 T3–T16 ‖ Phase 4** — disjoint.

**The one pairing to keep an eye on:** Phase 3 ‖ Phase 5. They share `RotationPanel.tsx`
in the *pre-ruling* plan; after §A.2.4 (P3 T1 no longer touches it) they are disjoint. If
that ruling is not applied, these two phases **must** serialise.

### F.4 — Still valid from the README

The README's existing "Pulling P0s forward" note stands: OL-01 / OL-02 / OL-03 / OL-04 are
user-visible breakage and should run immediately after Phase 0, ahead of the rest of Phase 6.
Since P6 T1 must follow P0 T8 anyway (F.2), this slots in naturally at the head of the
parallel band.

### F.5 — Gate between bands

Before opening the parallel band, confirm on the Phase-1 branch:
- `npm run test:lib` and `npm run test:component` green;
- `npm run build` clean;
- `dashboard/lib/format.ts`, `labels.ts`, `storageKeys.ts` and all nine §B primitives
  exported with the contract signatures — the parallel band assumes these are frozen, and
  a late change to any of them invalidates work in up to five branches simultaneously.

---

## Section E — Audit coverage audit

Cross-check of the six phase coverage tables against `MARKET_ANALYSE_UI_AUDIT.md`.
**169 unique finding IDs** were extracted from the audit.

### E.0 — Two IDs queried in the brief: both real

- **LR-10** — present in `MARKET_ANALYSE_UI_AUDIT.md`. Not invented; the assumed
  `LR-01…LR-09` range in the brief was simply short.
- **AL-08** — present in `MARKET_ANALYSE_UI_AUDIT.md`. Not invented; the assumed
  `AL-01…AL-07` range was short.

Nothing in any phase doc cites a fabricated audit ID.

### E.1 — (a) IDs with no owning task

Five gaps. Each carries a recommended owner; assign before execution.

| ID | Finding | Why it fell through | **Assign to** |
|---|---|---|---|
| **X-03** | Four locales, no timezones (`en-NZ` in `app/page.tsx`, `en-AU` in `CatalystStrip`, `en-US` in `QuoteRow`) | P1 says "not in this phase"; P2 correctly observes the real violations live in `app/page.tsx` / `CatalystStrip` = Phase 3 territory; **but Phase 3's coverage table has no X-03 row.** Genuinely unowned. | **P3** — add a task (or fold into T1, which already modifies `app/page.tsx`): single locale + explicit timezone via `format.timestamp`. Note `QuoteRow` keeps its own grammar (§B.1) but must still use one locale. |
| **G-10** | `PageHeader` adoption across pages | P2 marks it "—"; no page phase claims it. P5 T10 and T14 add page headers to `/rotation` and `/macro` without claiming the ID. | **P5 T10 + T14** — add G-10 to their audit-findings-closed lists; note in the README that adoption is partial (rotation + macro only). |
| **A11Y-03** (residual) | Colour-only encoding — quadrant dots, GEX bar sign | P1 defers to P2/P5/P6; neither P5 nor P6 has an A11Y-03 row. | **P5 T6** (quadrant dots: add shape or text label alongside colour) and **P6 T18** (GEX bar sign: add `+`/`−` glyph or aria-label). |
| **A11Y-06** (residual) | Bespoke `<table>`s without proper semantics — OptionsPanel, HistoryCard, strikes ladder | De-facto closed for portfolio by P4 T20 and for rotation by P5 T6 (both adopt `DataTable`), but the remaining three tables are unclaimed. | **P6** — OptionsPanel and the strikes ladder are Phase 6 surfaces; add A11Y-06 to the relevant table task. HistoryCard → **P3**. |
| **MC-01** | `/macro` missing from nav | P5 says "owned by the Chrome agent"; P2 **does** close it via Task 1 but files the work only under G-01. Same fix, two IDs — the ID is unowned on paper. | **P2 T1** — add MC-01 to its audit-findings-closed list alongside G-01. |

### E.2 — (b) IDs claimed by two phases

All fifteen are resolved by the Section A rulings. Sole owner after reconciliation:

| ID | Was claimed by | **Sole owner** | Ruling |
|---|---|---|---|
| PF-08 | P1 T35, P4 T24 | **P4 T24** | §A.2.12 |
| AL-04 | P1 T22, P4 T30 | **P4 T30** | §A.2.10 |
| AL-08 | P1 T22, P4 T34 | **P4 T34** | §A.2.10 |
| WL-01 | P1 T30, P4 T2 | **P4 T2** | §A.2.11 |
| SC-06 | P1 T21, P4 T15 | **P4 T15** | §A.2.9 |
| SC-08 | P1 T21, P4 T13 | **P4 T13** | §A.2.9 |
| SC-09 | P1 T21, P4 T11 | **P4 T11** | §A.2.9 |
| UI-10 (screener) | P1 T21, — | **P4 T10** (absorbed) | §A.2.9 |
| TD-05 | P1 T24, P3 T4 | **P3 T4** | §A.2.2 |
| TD-11 | P1 T25, P3 T8 | **P1 T25** | §A.2.3 |
| TK-04 | P1 T29, P3 T14 | **P3 T14** | §A.2.7 |
| TK-07 | P1 T28, P3 T15 | **P3 T15** | §A.2.6 |
| TK-12 | P1 T33, P3 T19 | **split**: log toggle → P1 T33; ARIA/crosshair/volume/conventions → P3 T19 | §A.2.8 |
| RO-04, UI-09 (RotationPanel) | P1 T32, P5 T8 | **P5 T8** | §A.2.4 |
| OD-08, UI-04 (VerdictCard) | P1 T26, P6 T13 | **P6 T13** | §A.2.5 |
| A11Y-02 (VerdictCard) | P1 T26 | **P6 T13** (transplanted) | §A.2.5 |
| UI-04, X-05 (WhyPanel) | P1 T27/T28, P3 T15 | **P3 T15** | §A.2.6 |
| G-01 / MC-01 | P2 T1, P5 (deferred) | **P2 T1** (both IDs) | §E.1 |

### E.3 — (c) IDs deliberately skipped, with stated reason

Confirmed intentional. No action needed; listed so a later reader does not re-open them.

| ID | Reason | Where stated |
|---|---|---|
| **G-14** (Settings page) | **Confirmed absent by design** — user deferral. | README + P2 coverage row, both explicit "—" |
| **X-01** (Market Review port) | **Confirmed absent by design** — out of scope. | README + explicit "out of scope" rows in P1, P2, P3 |
| **X-02** (argus dev UI half) | Internal, non-user-facing surface. | P1 |
| **AL-07** (alerts pagination) | Explicit deferral — volume does not warrant it. | P4 |
| **SC-05** ("one precision" reading) | Deliberate narrowing: the plan standardises precision per *column semantic*, not globally. | P4 |
| **RO-04** ("ceiling" limitation) | **No longer skipped** — contract fix 4 (§B.4) removes the ceiling; P5 T8 now glosses all four headers. | was P5's closing section; strike it |

### E.4 — Net coverage

Of 169 audit IDs: 5 unowned (§E.1, all now assigned by recommendation), 6 deliberately
skipped with a stated reason (§E.3), and the remainder owned by exactly one task after
the §E.2 de-duplication.

---

## Section D — Interface drift

Name and signature mismatches across phase boundaries. Ten items; two are genuine bugs
that will not compile or will render wrong, the rest are consistency defects.

### D.1 — `<Badge variant="edge">` is not in the frozen variant union — **legal, must be minuted**

`05-phase4-tables-and-crud.md` Task 24 (lines 2507-2508, 2587) writes
`<Badge variant="edge">`, but `BadgeProps.variant` as defined by P1 T14 is
`"tier" | "verdict" | "style" | "flag"`. P4 T24 does add the variant — so this compiles —
but `Badge.tsx` is **not** a §B contract primitive, and P3 T14 deliberately leaves the
file unmodified assuming a fixed union.

**Ruling:** legal, keep. Record the union extension in P1 T14's Files block as a forward
note (*"P4 T24 extends this union with `edge`"*) so the P1 → P4 ordering in §A.4 is not
lost, and so no later task re-freezes the union.

### D.2 — `fmtPrice` dangling identifier — **WITHDRAWN, NOT A BUG**

> **This finding was raised during review and then disproved. Recorded here so it is not
> re-raised.** Do not "fix" Task 22 — it is correct as written.

`05-phase4-tables-and-crud.md` **Task 22** (doc lines 2380-2382) writes:

```tsx
<StatChip label="NLV" value={fmtPrice(Number(account.NetLiquidation))} />
```

The original finding observed that `fmtPrice` does not exist in
`dashboard/app/portfolio/page.tsx` today — true, but irrelevant. **Task 22 declares the
identifier itself**, at doc line 2345, inside its own Step 3 implementation block:

```tsx
import { signedCurrency, price as fmtPrice } from "@/lib/format";
```

That is a standard aliased import of the contract's `format.price`. It compiles, and it
honours the task's stated Interfaces block rather than contradicting it. The alias exists
to keep the diff against the pre-existing call sites small.

**Ruling: no change.** Task 22 stands as written.

### D.3 — `HEADER_GLOSS` keys used but not defined — resolved by contract fix 4

P4 T14 uses `HEADER_GLOSS.L`, `.S`, `.W`, `.HC`, `["Agree%"]`, `["R:R"]`; none are in the
frozen map. Resolved by the ADDITIVE docblock (§B.4) — P4 T14 adds them itself, which is
now explicitly sanctioned.

### D.4 — Inconsistent `HEADER_GLOSS` treatment across phases — resolved by contract fix 4

P4 extends the map freely; P5 T8 refuses to and leaves four headers unglossed. Same
contract section, opposite readings. Resolved by §B.4; **P5 T8 must now gloss
`Industry` / `1W` / `1M` / `3M`** using the copy recorded there.

### D.5 — Phase 5 test paths violate the Phase 0 `__tests__/` convention

`lib/rotation.test.ts` and `lib/chartConventions.test.ts` should be
`lib/__tests__/rotation.test.ts` and `lib/__tests__/chartConventions.test.ts`. See §A.3.

### D.6 — Phase 2 writes paths without the `dashboard/` prefix

`03-phase2-chrome-and-rails.md` writes `components/rails/LeftRail.tsx` where every other
phase writes `dashboard/components/rails/LeftRail.tsx`. Cosmetic, but it defeats a
cross-document grep for a file path — which is exactly how this reconciliation was done.

**Ruling:** normalise Phase 2's Files blocks to the `dashboard/`-prefixed form. Low
priority; do it if the doc is being edited anyway for the §A.2.1 ruling.

### D.7 — Phase 6 cites "Task 28" where it means Task 26

Both `07-phase6-options-live.md`'s header and its Task 5 body point at "Task 28" for the
chart-conventions re-check. Task 28 is the expiry control (OL-20); the chart task is
**Task 26** (OL-18). See §A.2.14.

### D.8 — Phase 6 File Structure contains a bogus path

`dashboard/argus/argus/options_live/models.py` — no such file. The intended path is
`argus/argus/options_live/models.py` (the backend package sits beside `dashboard/`, not
inside it). Correct it in the doc's File Structure table.

### D.9 — P6 T5 re-declares `formatYAxis` at 0dp vs contract `format.compactNumber` at 1dp

See §A.2.14. Genuine semantic drift — would ship a fresh instance of the X-08 duplication
the plan exists to close, with a different rounding rule from every other compact number
in the app.

### D.10 — X-03 vs X-08 mislabel — **verified, already corrected upstream**

The locale/timezone finding is **X-03** (audit line 421, "Four locales, no timezones"),
not X-08 (audit line 431, the unrelated ad hoc number-precision finding). The original
task brief for Phase 2 carried the mislabel.

**Verified:** `03-phase2-chrome-and-rails.md` line 3109 already documents and corrects it
— *"Original task-brief citation 'X-08 (locale/timezone)' is mislabeled — the real ID is
X-03."* **No phase doc's coverage table repeats the mislabel.** No action required beyond
noting that X-03 itself is unowned (§E.1).

### D.11 — Primitive props: no drift found

Every consumer of the nine §B primitives (`Button`, `Input`, `Select`, `Collapsible`,
`PinToggle`, `CenterBar`, `InfoTip`, `Toggle`, `UndoToastProvider` / `useUndoAction`)
across Phases 2–6 was checked against the frozen signatures. **No prop-name or
prop-shape mismatch found.** Likewise `format.*` (no `pct()` vs `formatPct()` split —
every phase uses the `format.` namespace form), `labels.*`, and `storageKeys.*`.
With D.2 withdrawn, **no namespace defect remains** — the only genuine drift is D.3's
locally re-declared `formatYAxis` in Phase 6 Task 5.

---

## Appendix — Complete list of edits to apply to the phase documents

Ordered by document, so an agent can work one file at a time.

**`02-phase1-design-system.md`**
- DELETE Task 21 (screener) — §A.2.9
- DELETE Task 22 (alerts) — §A.2.10
- DELETE Task 23, DELETE Task 24 (SignalGroups) — §A.2.2
- DELETE Task 26 (VerdictCard) — §A.2.5
- REDUCE Task 27 (WhyPanel) to 3 steps — §A.2.6
- DELETE Task 28 (WhyPanel votes) — §A.2.6
- REDUCE Task 29 (Header) to 2 steps — §A.2.7
- DELETE Task 30 (WatchlistClient) — §A.2.11
- Task 31: `Modify:` → `Create:` for `WatchlistClient.test.tsx`; drop "created in Task 30" — §A.2.11
- DELETE Task 32 (RotationPanel) — §A.2.4
- DELETE Task 35 (portfolio) — §A.2.12
- Task 14: forward note that P4 T24 extends `BadgeProps.variant` with `edge` — §D.1
- Coverage table: remove rows reassigned in §E.2
- New count: **26 tasks**

**`03-phase2-chrome-and-rails.md`**
- Task 11: depends on P1 T9; preserve `UndoToastProvider` outermost; re-anchor line numbers — §A.2.1
- Task 1: add MC-01 to audit-findings-closed — §E.1
- Normalise Files-block paths to the `dashboard/` prefix — §D.6
- Count unchanged: **27 tasks**

**`04-phase3-today-and-ticker.md`**
- Task 1: remove `RotationPanel.tsx` from Files; `lib/rotation.ts` becomes consume-only — §A.2.4, §A.2.13
- Task 3: drop the `LegacyInfoTip` rename; migrate the local `InfoTip` to the contract primitive directly — §A.2.2
- Task 4: absorb `- Delete: dashboard/components/ui/MicroBar.tsx` — §A.2.2
- Task 6: `DataTable.test.tsx` `Create:` → `Modify:` — §A.3
- DELETE Task 8 (DiffStrip), leave a removal stub — §A.2.3
- Task 11: `CandleChart.test.tsx` `Create:` → `Modify:` — §A.3
- Task 14: `Header.test.tsx` `Create:` → `Modify:`; preserve `PinToggle` from P1 T29 — §A.2.7, §A.3
- Task 15: `WhyPanel.test.tsx` `Create:` → `Modify:` — §A.3
- Task 19: scope to ARIA/crosshair/volume + **chart-conventions addendum**; depends on P5 T1 — §A.2.8
- Add an X-03 owner (locale/timezone) — §E.1
- Add A11Y-06 for HistoryCard — §E.1
- Coverage: gain UI-09/UI-10/UI-12/X-06/X-07 (SignalGroups), UI-04/X-05/TK-07 (WhyPanel); lose TD-11
- New count: **23 tasks**

**`05-phase4-tables-and-crud.md`**
- Task 1: `WatchlistClient.test.tsx` `Create:` → `Modify:` — §A.2.11
- Task 10: absorb the `EmptyState` migration at `screener/page.tsx:377-378`; add UI-10 — §A.2.9
- Task 20: fold in `avg_cost` → `format.price` — §A.2.12
- Task 22: **no change** — the `fmtPrice` finding was withdrawn; the task declares the alias itself — §D.2
- Task 24: `Badge.test.tsx` `Create:` → `Modify:` — §A.3
- Count unchanged: **34 tasks**

**`06-phase5-rotation-macro-charts.md`**
- Task 1: test path → `dashboard/lib/__tests__/chartConventions.test.ts` — §A.3
- Task 2: test path → `dashboard/lib/__tests__/rotation.test.ts`; **export `rotationSummary()`** transplanted from P3 T1 — §A.2.13, §A.3
- Task 6: add A11Y-03 (quadrant dots) — §E.1
- Task 8: **gloss `Industry` / `1W` / `1M` / `3M`** using §B.4's copy; delete the "did not hold up" caveat — §A.2.4, §B.4
- Tasks 10, 14: add G-10 — §E.1
- Task 16: `MacroGauges.test.tsx` `Create:` → `Modify:`; after P2 T18 — §A.3, §A.4
- §3: fix the dangling "CandleChart … fixed in Task 8" reference — §A.2.8
- Count unchanged: **16 tasks**

**`07-phase6-options-live.md`**
- Doc header and Task 5: "Task 28" → **"Task 26"** — §A.2.14, §D.7
- Task 5: delete local `formatYAxis`; use `format.compactNumber` + `CHART_HEIGHT`; depends on P5 T1 and P1 T2 — §A.2.14, §D.9
- Task 13: absorb the A11Y-02 type-scale bump from P1 T26; add A11Y-02 to findings closed — §A.2.5
- Task 18: add A11Y-03 (GEX bar sign) — §E.1
- Add A11Y-06 for OptionsPanel + strikes ladder — §E.1
- File Structure: delete the bogus `dashboard/argus/argus/options_live/models.py` — §D.8
- Count unchanged: **28 tasks**

**`01-phase0-test-infra.md`** — no changes. **9 tasks.**

**`00-foundations-contract.md`** — all four fixes already applied (§B). No further changes.
