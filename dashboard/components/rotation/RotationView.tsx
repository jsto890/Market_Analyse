"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RRGChart, { type SectorNames } from "@/components/rotation/RRGChart";
import MovedMost from "@/components/rotation/MovedMost";
import SectorCard from "@/components/rotation/SectorCard";
import RotationPanel, { type RotationRow } from "@/components/today/RotationPanel";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { rrgIndexByIndustry } from "@/lib/rotation";
import { useHeldPositions } from "@/lib/positions";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import { buildTrails, type TrailHistory } from "@/lib/rotationTrails";

/** How far back the tails reach. "Off" is not zero weeks — `weeklyTrail` slices
 *  with `slice(-weeks)`, and `slice(-0)` returns the whole array — so Off passes
 *  no trails at all. */
const TRAIL_OPTIONS = [
  { key: "4", label: "4w" },
  { key: "8", label: "8w" },
  { key: "off", label: "Off" },
];

/**
 * The chart's legend named all twelve sectors roughly 100px above the table
 * that names the same twelve — the same thing said twice on one scroll. The
 * legend went; the table took its job. That needs one owner for the selection,
 * which is the only reason this wrapper exists.
 */
export default function RotationView({
  rows,
  namesBySector,
  history,
}: {
  rows: RotationRow[];
  namesBySector?: SectorNames;
  history?: TrailHistory;
}) {
  // Today's sector strip links here as `/rotation?sector=<industry>`. Without
  // this the link lands on the page and preselects nothing, which reads as a
  // broken link rather than a deep one. Only the initial value comes from the
  // URL — clicking the chart or the table after that is local state, not a
  // navigation.
  const sectorParam = useSearchParams()?.get("sector") ?? null;
  const [selected, setSelected] = useState<string | null>(sectorParam);
  const [trailKey, setTrailKey] = useLocalStorage<string>(STATIC_KEYS.rotationTrail, "8");
  const rrgIndex = useMemo(() => rrgIndexByIndustry(rows), [rows]);
  const held = useHeldPositions();

  const trails = useMemo(() => {
    if (trailKey === "off") return undefined;
    return buildTrails(history, rows.map((r) => r.industry), Number(trailKey));
  }, [history, rows, trailKey]);

  // Nothing picked yet: the top-ranked sector is what the page is about until
  // you say otherwise. An empty rail beside a full chart reads as missing
  // column furniture.
  const focus = rows.find((r) => r.industry === selected) ?? [...rows].sort((a, b) => a.rank - b.rank)[0] ?? null;

  return (
    <>
      <SegmentedControl
        label="Trail"
        value={trailKey}
        options={TRAIL_OPTIONS}
        onChange={setTrailKey}
      />
      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <RRGChart
          rows={rows}
          trails={trails}
          selected={selected}
          onSelect={setSelected}
        />
        <div className="flex flex-col gap-3">
          <MovedMost rows={rows} selected={selected} onSelect={setSelected} />
          {focus && (
            <SectorCard
              row={focus}
              names={namesBySector?.[focus.industry] ?? []}
              held={held}
            />
          )}
        </div>
      </div>
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
