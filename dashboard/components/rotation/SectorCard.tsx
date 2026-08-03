"use client";

import Link from "next/link";
import Panel from "@/components/ui/Panel";
import type { RotationRow } from "@/components/today/RotationPanel";
import { HeldChips } from "@/lib/positions";
import { QUADRANT_COLOR } from "@/lib/rotation";
import { QUADRANT_LABEL } from "@/lib/labels";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="text-data text-foreground">{value}</p>
    </div>
  );
}

/**
 * The sector the chart is currently focused on, in full. This replaces the
 * strip that used to hang off the foot of the RRG panel — same names, same
 * held-position chips, now beside the chart instead of under it.
 *
 * No macro-tone row: the mock has one, but macro scopes are sector_taxonomy
 * families and this rows on yfinance industries, so the join never lands.
 */
export default function SectorCard({
  row,
  names,
  held,
}: {
  row: RotationRow;
  names: { ticker: string; action_label?: string }[];
  held?: Map<string, number>;
}) {
  const label = QUADRANT_LABEL[row.quadrant as keyof typeof QUADRANT_LABEL] ?? row.quadrant;
  return (
    <Panel
      heading="eyebrow"
      title={
        <span className="inline-flex items-baseline gap-2">
          <span
            aria-hidden
            className="block h-2 w-2 shrink-0 self-center rounded-full"
            style={{ background: QUADRANT_COLOR[row.quadrant] ?? "var(--muted)" }}
          />
          {row.industry}
        </span>
      }
      subtitle={label}
    >
      <div className="grid grid-cols-3 gap-2 px-3 py-2">
        <Stat label="RS-Ratio" value={row.rs_ratio.toFixed(1)} />
        <Stat label="RS-Mom" value={row.rs_mom.toFixed(1)} />
        {row.r1m != null && Number.isFinite(row.r1m) && (
          <Stat label="1M" value={`${row.r1m >= 0 ? "+" : ""}${row.r1m.toFixed(1)}%`} />
        )}
      </div>
      <div className="border-t border-line px-3 py-2">
        <p className="eyebrow">Your names in it</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          {names.length > 0 ? (
            names.map((n) => (
              <Link
                key={n.ticker}
                href={`/t/${n.ticker}`}
                className="rounded border border-line px-1.5 py-px font-mono text-micro text-accent hover:bg-elevated"
              >
                {n.ticker}
              </Link>
            ))
          ) : (
            <span className="text-body text-muted">
              Nothing from this sector made today&rsquo;s list — the rotation is there, the setups
              are not.
            </span>
          )}
          {held && names.length > 0 && (
            <HeldChips
              symbols={names.map((n) => n.ticker)}
              held={held}
              className="border-l border-line pl-2"
            />
          )}
        </div>
      </div>
    </Panel>
  );
}
