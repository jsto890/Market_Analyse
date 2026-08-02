"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { heatBg } from "@/lib/heat";
import { QUADRANT_LABEL } from "@/lib/labels";
import type { RotationRow } from "@/components/today/RotationPanel";

/**
 * One cell per sector, strongest first — the whole rotation snapshot on one
 * row rather than a wrapping block of tiles. The cell label is the industry
 * name: the rotation job emits yfinance industries, not sector ETFs, so there
 * is no ticker to key a cell by. The long name is truncated to the cell and
 * deferred to a Radix tooltip, which also carries the quadrant word the old
 * two-line cell spent a colour dot on. Each cell deep-links to its own sector;
 * the band itself is not a link, so a click always goes somewhere specific.
 */
export default function SectorStrip({ rows }: { rows: RotationRow[] }) {
  const sorted = [...rows].sort((a, b) => (b.r1w ?? -Infinity) - (a.r1w ?? -Infinity));

  return (
    <Panel
      title="Sector rotation"
      heading="eyebrow"
      actions={
        <Link href="/rotation" className="shrink-0 text-label text-accent">
          Full RRG →
        </Link>
      }
    >
      {/* Eleven columns is the mock's floor, not a cap: the mock's row set is
          the eleven GICS sectors, ours is the rotation job's industry list and
          it varies (twelve today). A twelfth cell wrapped onto a second line as
          a single orphan, which is the block layout T-17 was raised against.
          The strip stays one row — the extra column count is data, not design. */}
      <div
        className="grid grid-cols-11 gap-1"
        style={
          sorted.length > 11
            ? { gridTemplateColumns: `repeat(${sorted.length}, minmax(0,1fr))` }
            : undefined
        }
      >
        {sorted.map((r) => (
          <Tooltip.Root key={r.industry}>
            <Tooltip.Trigger asChild>
              <Link
                href={`/rotation?sector=${encodeURIComponent(r.industry)}`}
                // The heat tint is an inline background, so hover reads as a ring
                // rather than a second background it would sit underneath.
                className="flex min-w-0 flex-col items-center rounded-[4px] p-[7px_4px] text-center hover:ring-1 hover:ring-inset hover:ring-line-strong"
                style={{ backgroundColor: heatBg(r.r1w) }}
              >
                {/* The label keeps the 11px micro role — it is the cell's
                    header, which is what micro is for — but drops the forced
                    uppercase. These are industry names, not tickers, and
                    SOFTWARE - INFRASTRUCTURE shouted across eleven cells is a
                    lot of noise for a strip you read at a glance. The figure
                    below it is a figure, so it takes `text-data` like every
                    other number in the product; 13px mono still fits the cell. */}
                <span className="w-full truncate text-micro normal-case text-foreground">
                  {r.industry}
                </span>
                {r.r1w != null && (
                  <span
                    className={`text-data leading-tight ${r.r1w >= 0 ? "text-pos" : "text-neg"}`}
                  >
                    {r.r1w >= 0 ? "+" : ""}
                    {r.r1w.toFixed(1)}%
                  </span>
                )}
              </Link>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-xs rounded border border-line bg-elevated px-2 py-1.5 text-body text-2"
                sideOffset={4}
              >
                {r.industry} ·{" "}
                {QUADRANT_LABEL[r.quadrant as keyof typeof QUADRANT_LABEL] ?? r.quadrant}
                <Tooltip.Arrow className="fill-elevated" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </div>
    </Panel>
  );
}
