"use client";

import { useMemo, useState } from "react";
import RRGChart, { type SectorNames } from "@/components/rotation/RRGChart";
import RotationPanel, { type RotationRow } from "@/components/today/RotationPanel";
import { rrgIndexByIndustry } from "@/lib/rotation";
import { useHeldPositions } from "@/lib/positions";

/**
 * The chart's legend named all twelve sectors roughly 100px above the table
 * that names the same twelve — the same thing said twice on one scroll. The
 * legend went; the table took its job. That needs one owner for the selection,
 * which is the only reason this wrapper exists.
 */
export default function RotationView({
  rows,
  namesBySector,
}: {
  rows: RotationRow[];
  namesBySector?: SectorNames;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const rrgIndex = useMemo(() => rrgIndexByIndustry(rows), [rows]);
  const held = useHeldPositions();

  return (
    <>
      <RRGChart
        rows={rows}
        namesBySector={namesBySector}
        held={held}
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
