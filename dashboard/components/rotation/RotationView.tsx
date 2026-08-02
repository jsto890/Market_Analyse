"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RRGChart, { type SectorNames } from "@/components/rotation/RRGChart";
import RotationPanel, { type RotationRow } from "@/components/today/RotationPanel";
import { rrgIndexByIndustry } from "@/lib/rotation";
import { useHeldPositions } from "@/lib/positions";
import type { TrailPoint } from "@/lib/rotationTrails";

/**
 * The chart's legend named all twelve sectors roughly 100px above the table
 * that names the same twelve — the same thing said twice on one scroll. The
 * legend went; the table took its job. That needs one owner for the selection,
 * which is the only reason this wrapper exists.
 */
export default function RotationView({
  rows,
  namesBySector,
  trails,
}: {
  rows: RotationRow[];
  namesBySector?: SectorNames;
  trails?: Record<string, TrailPoint[]>;
}) {
  // Today's sector strip links here as `/rotation?sector=<industry>`. Without
  // this the link lands on the page and preselects nothing, which reads as a
  // broken link rather than a deep one. Only the initial value comes from the
  // URL — clicking the chart or the table after that is local state, not a
  // navigation.
  const sectorParam = useSearchParams()?.get("sector") ?? null;
  const [selected, setSelected] = useState<string | null>(sectorParam);
  const rrgIndex = useMemo(() => rrgIndexByIndustry(rows), [rows]);
  const held = useHeldPositions();

  return (
    <>
      <RRGChart
        rows={rows}
        namesBySector={namesBySector}
        held={held}
        trails={trails}
        selected={selected}
        onSelect={setSelected}
      />
      <RotationPanel
        rows={rows}
        defaultOpen
        collapsible={false}
        rrgIndex={rrgIndex}
        selected={selected}
        onSelect={setSelected}
      />
    </>
  );
}
