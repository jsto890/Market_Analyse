"use client";

import { useMemo } from "react";
import Panel from "@/components/ui/Panel";
import DataTable, { type Column } from "@/components/ui/DataTable";
import InfoTip from "@/components/ui/InfoTip";
import Gloss from "@/components/ui/Gloss";
import { QUADRANT_COLOR } from "@/lib/rotation";
import { QUADRANT_LABEL, HEADER_GLOSS } from "@/lib/labels";

export interface RotationRow {
  industry: string;
  quadrant: "leading" | "improving" | "weakening" | "lagging" | string;
  rs_ratio: number;
  rs_mom: number;
  breadth: number | null;
  n: number | null;
  r1w: number | null;
  r1m: number | null;
  r3m: number | null;
  rank: number;
  drank: number | null;
}

interface RotationPanelProps {
  rows: RotationRow[];
  defaultOpen?: boolean;
  collapsible?: boolean;
  /** Passed only on /rotation, where this table doubles as the RRG's legend:
   *  the number in front of each industry is the number on its scatter point.
   *  Absent on Today, where there is no chart to key into. */
  rrgIndex?: Record<string, number>;
  selected?: string | null;
  onSelect?: (industry: string | null) => void;
}


/** Dot plus word. The dot keys the row to its colour on the RRG above; the word
 *  is what the column actually says, and a colour alone said it only to people
 *  who hovered it and could tell four hues apart. */
function QuadrantCell({ quadrant }: { quadrant: string }) {
  const color = QUADRANT_COLOR[quadrant] ?? "var(--muted)";
  const label = QUADRANT_LABEL[quadrant as keyof typeof QUADRANT_LABEL] ?? quadrant;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function DRank({ drank }: { drank: number | null }) {
  if (drank === null) return <span className="text-muted">—</span>;
  if (Math.abs(drank) < 2) {
    const sign = drank > 0 ? "+" : "";
    return (
      <InfoTip content={HEADER_GLOSS["Δrank"]}>
        <span className="text-data text-muted">
          {sign}
          {drank}
        </span>
      </InfoTip>
    );
  }
  const sign = drank > 0 ? "+" : "";
  return (
    <span className="text-data text-model">
      {sign}
      {drank}
    </span>
  );
}

function Ret({ v }: { v: number | null }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted">—</span>;
  const sign = v >= 0 ? "+" : "";
  return (
    <span className={v >= 0 ? "text-pos" : "text-neg"}>
      {sign}
      {v.toFixed(1)}
    </span>
  );
}

const columns: Column<RotationRow>[] = [
  {
    key: "industry",
    header: "Industry",
    render: (r) => {
      const thin = r.n != null && r.n < 20;
      if (!thin) return r.industry;
      return (
        <span className="inline-flex items-center gap-1.5">
          {r.industry}
          <InfoTip content={HEADER_GLOSS.n}>
            <span className="rounded border border-line px-1 eyebrow">thin</span>
          </InfoTip>
        </span>
      );
    },
  },
  {
    key: "drank",
    header: <Gloss term="Δrank" />,
    align: "center",
    render: (r) => <DRank drank={r.drank} />,
  },
  {
    key: "quadrant",
    header: <Gloss term="Quadrant" />,
    render: (r) => <QuadrantCell quadrant={r.quadrant} />,
  },
  {
    key: "rs_ratio",
    align: "right",
    header: <Gloss term="RS-Ratio" />,
    render: (r) => r.rs_ratio.toFixed(1),
  },
  {
    key: "rs_mom",
    align: "right",
    header: <Gloss term="RS-Mom" />,
    render: (r) => r.rs_mom.toFixed(1),
  },
  {
    key: "breadth",
    align: "right",
    header: <Gloss term="Breadth" />,
    render: (r) => (Number.isFinite(r.breadth) ? Math.round(r.breadth!) + "%" : "—"),
  },
  {
    key: "n",
    align: "right",
    header: <Gloss term="n" />,
    render: (r) => r.n ?? "—",
  },
  { key: "r1w", align: "right", header: "1W", render: (r) => <Ret v={r.r1w} /> },
  { key: "r1m", align: "right", header: "1M", render: (r) => <Ret v={r.r1m} /> },
  { key: "r3m", align: "right", header: "3M", render: (r) => <Ret v={r.r3m} /> },
];

/**
 * The RRG numbers its points and leaves them unnamed; this is where a number
 * becomes a sector. Prefixing the industry column rather than adding a column
 * of its own keeps the sticky-left cell the one that identifies the row.
 */
function withRrgIndex(
  cols: Column<RotationRow>[],
  rrgIndex: Record<string, number>
): Column<RotationRow>[] {
  const [industry, ...rest] = cols;
  return [
    {
      ...industry,
      header: (
        <span className="inline-flex items-baseline gap-2">
          <span className="w-4 text-right text-muted">#</span>
          <span>Industry</span>
        </span>
      ),
      render: (r) => (
        <span className="inline-flex items-baseline gap-2">
          <span className="w-4 shrink-0 text-right text-data text-muted">
            {rrgIndex[r.industry] ?? "·"}
          </span>
          <span>{industry.render(r)}</span>
        </span>
      ),
    },
    ...rest,
  ];
}

export default function RotationPanel({
  rows,
  defaultOpen = false,
  collapsible = true,
  rrgIndex,
  selected = null,
  onSelect,
}: RotationPanelProps) {
  const cols = useMemo(() => (rrgIndex ? withRrgIndex(columns, rrgIndex) : columns), [rrgIndex]);
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const fading = rows.filter((r) => r.quadrant === "weakening" || r.quadrant === "lagging").length;
  const leading = sorted
    .filter((r) => r.quadrant === "leading")
    .slice(0, 2)
    .map((r) => r.industry);
  const leadingText = leading.length > 0 ? `Leading: ${leading.join(", ")}` : "Leading: none";
  const summary = `${leadingText} · ${fading}/${rows.length} fading`;

  return (
    <Panel title="Sector rotation" subtitle={summary} collapsible={collapsible} defaultOpen={defaultOpen} persistKey="rotation">
      <DataTable<RotationRow>
        columns={cols}
        rows={sorted}
        rowKey={(r) => r.industry}
        persistKey="rotation-table"
        selectedKey={selected}
        onOpen={onSelect ? (r) => onSelect(selected === r.industry ? null : r.industry) : undefined}
      />
    </Panel>
  );
}
