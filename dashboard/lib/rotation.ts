/** Shared Relative Rotation Graph (JdK RRG) domain logic — the single place
 *  RRGChart and RotationPanel both source quadrant color from (RO-01), and
 *  where the degenerate-row split (RO-06) and label-collision detection
 *  (RO-07) live so they're unit-testable without rendering a chart. Also
 *  the sole creator of `rotationSummary()` (TD-13) — see 08-reconciliation.md
 *  §A.2.13; `04-phase3-today-and-ticker.md`'s Task 1 consumes it from here. */
import type { RotationRow } from "@/components/today/RotationPanel";

interface QuadrantInput {
  quadrant: string;
  rs_ratio: number;
  rs_mom: number;
}

/** Quadrant → chart/badge color. Human-readable labels live in the frozen
 *  `lib/labels.ts` QUADRANT_LABEL map, not here — this is colors only. */
export const QUADRANT_COLOR: Record<string, string> = {
  leading: "var(--green)",
  improving: "var(--teal)",
  weakening: "var(--amber)",
  lagging: "var(--red)",
};

export function deriveQuadrant(row: QuadrantInput): string {
  if (row.quadrant in QUADRANT_COLOR) return row.quadrant;
  if (row.rs_ratio >= 100 && row.rs_mom >= 100) return "leading";
  if (row.rs_ratio < 100 && row.rs_mom >= 100) return "improving";
  if (row.rs_ratio >= 100 && row.rs_mom < 100) return "weakening";
  return "lagging";
}

/** Sectors whose relative-strength line is flat (constituent closes failed
 *  to load) come out exactly at 100/100 — meaningless points that pile up
 *  on the origin and collide. Split them out by name instead of just
 *  counting them (RO-06), so the chart can list which sectors are hidden. */
export function splitDegenerate<T extends { rs_ratio: number; rs_mom: number }>(
  rows: T[]
): { plotted: T[]; hidden: T[] } {
  const plotted: T[] = [];
  const hidden: T[] = [];
  for (const r of rows) {
    const degenerate = Math.abs(r.rs_ratio - 100) < 0.05 && Math.abs(r.rs_mom - 100) < 0.05;
    (degenerate ? hidden : plotted).push(r);
  }
  return { plotted, hidden };
}

/** Same computation RotationPanel.tsx uses for its own Panel subtitle, extracted
 *  so the Today-page teaser link (`app/page.tsx`) can show it too, instead of the
 *  contentless "N sectors tracked" (TD-13). Transplanted here from Phase 3's
 *  original Task 1 per 08-reconciliation.md §A.2.13 — this file is the sole
 *  creator of `lib/rotation.ts`; Phase 3's Task 1 is consume-only. */
export function rotationSummary(rows: RotationRow[]): string {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const fading = rows.filter(
    (r) => r.quadrant === "weakening" || r.quadrant === "lagging"
  ).length;
  const leading = sorted
    .filter((r) => r.quadrant === "leading")
    .slice(0, 2)
    .map((r) => r.industry);
  const leadingText = leading.length > 0 ? `Leading: ${leading.join(", ")}` : "Leading: none";
  return `${leadingText} · ${fading}/${rows.length} fading`;
}
