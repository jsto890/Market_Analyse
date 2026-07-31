"use client";

import Link from "next/link";
import { heatBg } from "@/lib/heat";
import { QUADRANT_COLOR, rotationSummary } from "@/lib/rotation";
import type { RotationRow } from "@/components/today/RotationPanel";

/**
 * One cell per sector, strongest first — the whole rotation snapshot at a
 * glance, where the Today page previously carried a single sentence linking
 * out. Trails are a `/rotation` job: `rotation_latest.json` is a flat snapshot
 * overwritten daily, so there is no prior position to draw one from.
 */
export default function SectorStrip({ rows }: { rows: RotationRow[] }) {
  const sorted = [...rows].sort((a, b) => (b.r1w ?? -Infinity) - (a.r1w ?? -Infinity));

  return (
    <section className="rounded-md border border-line bg-elevated">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="tick truncate text-title text-foreground">Sector rotation</span>
          <span className="truncate text-body text-3">{rotationSummary(rows)}</span>
        </div>
        <Link href="/rotation" className="shrink-0 text-body text-muted hover:text-accent">
          Full RRG ›
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-line bg-line sm:grid-cols-4 lg:grid-cols-6">
        {sorted.map((r) => (
          <Link
            key={r.industry}
            href="/rotation"
            // The heat tint is an inline background, so hover reads as a ring
            // rather than a second background it would sit underneath.
            className="flex min-w-0 flex-col gap-0.5 bg-elevated px-2 py-2 hover:ring-1 hover:ring-inset hover:ring-line-strong"
            style={{ backgroundColor: heatBg(r.r1w) }}
          >
            <span className="flex min-w-0 items-center gap-1">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: QUADRANT_COLOR[r.quadrant] ?? "var(--muted)" }}
              />
              <span className="line-clamp-2 min-w-0 text-micro leading-tight text-2">
                {r.industry}
              </span>
            </span>
            <span
              className={`text-data ${
                r.r1w == null ? "text-muted" : r.r1w >= 0 ? "text-pos" : "text-neg"
              }`}
            >
              {r.r1w == null ? "—" : `${r.r1w >= 0 ? "+" : ""}${r.r1w.toFixed(1)}%`}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
