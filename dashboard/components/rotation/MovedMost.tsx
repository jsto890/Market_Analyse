"use client";

import Panel from "@/components/ui/Panel";
import type { RotationRow } from "@/components/today/RotationPanel";
import { QUADRANT_COLOR } from "@/lib/rotation";
import { QUADRANT_LABEL } from "@/lib/labels";

/** How many make the card. Past four it stops being "what moved" and starts
 *  being the table that is already below the chart. */
const TOP_N = 4;

/**
 * The sectors whose rank changed most since the last run. The mock asked for
 * week-over-week quadrant transitions; `rotation_history.json` began on
 * 2026-08-01 and does not yet span two ISO weeks, so this reads the rank change
 * the rotation job already publishes and says so in the subtitle. A row with no
 * `drank` — a sector the previous run did not rank — is not a move and is left
 * out rather than shown as zero.
 */
export default function MovedMost({
  rows,
  selected,
  onSelect,
}: {
  rows: RotationRow[];
  selected: string | null;
  onSelect: (industry: string | null) => void;
}) {
  const moved = rows
    .filter((r) => r.drank !== null && r.drank !== 0)
    .sort((a, b) => Math.abs(b.drank!) - Math.abs(a.drank!))
    .slice(0, TOP_N);

  if (moved.length === 0) return null;

  return (
    <Panel heading="eyebrow" title="Moved most" subtitle="by rank change since the last run">
      <ul className="divide-y divide-line">
        {moved.map((r) => {
          const isSelected = selected === r.industry;
          const label = QUADRANT_LABEL[r.quadrant as keyof typeof QUADRANT_LABEL] ?? r.quadrant;
          return (
            <li key={r.industry}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : r.industry)}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors ${
                  isSelected ? "bg-accent/5" : "hover:bg-elevated"
                }`}
              >
                <span
                  aria-hidden
                  className="mt-1 block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: QUADRANT_COLOR[r.quadrant] ?? "var(--muted)" }}
                />
                <span className="min-w-0 flex-1 truncate text-body text-foreground">
                  {r.industry}
                </span>
                <span className="shrink-0 text-body text-muted">{label}</span>
                {/* A rank change is model output, not a return — `text-model`,
                    never the P&L palette. */}
                <span className="w-8 shrink-0 text-right text-data text-model">
                  {r.drank! > 0 ? "+" : ""}
                  {r.drank}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
