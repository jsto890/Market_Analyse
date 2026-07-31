"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import Panel from "@/components/ui/Panel";
import DataTable, { type Column } from "@/components/ui/DataTable";
import InfoTip from "@/components/ui/InfoTip";
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
}


function QuadrantDot({ quadrant }: { quadrant: string }) {
  const color = QUADRANT_COLOR[quadrant] ?? "var(--muted)";
  const label = QUADRANT_LABEL[quadrant as keyof typeof QUADRANT_LABEL] ?? quadrant;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex cursor-default items-center justify-center">
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="rounded bg-elevated px-2 py-1 text-dense text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          {label}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function DRank({ drank }: { drank: number | null }) {
  if (drank === null) return <span className="text-muted">—</span>;
  if (Math.abs(drank) < 2) {
    const sign = drank > 0 ? "+" : "";
    return (
      <InfoTip content={HEADER_GLOSS["Δrank"]}>
        <span className="tabular-nums text-muted">
          {sign}
          {drank}
        </span>
      </InfoTip>
    );
  }
  const sign = drank > 0 ? "+" : "";
  return (
    <span className={drank > 0 ? "text-pos" : "text-neg"}>
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
            <span className="rounded border border-line px-1 text-micro uppercase tracking-wide text-muted">
              thin
            </span>
          </InfoTip>
        </span>
      );
    },
  },
  {
    key: "drank",
    header: (
      <InfoTip content={HEADER_GLOSS["Δrank"]}>
        <span>Δrank</span>
      </InfoTip>
    ),
    align: "center",
    render: (r) => <DRank drank={r.drank} />,
  },
  {
    key: "quadrant",
    header: (
      <InfoTip content={HEADER_GLOSS["◉"]}>
        <span>◉</span>
      </InfoTip>
    ),
    align: "center",
    render: (r) => <QuadrantDot quadrant={r.quadrant} />,
  },
  {
    key: "rs_ratio",
    align: "right",
    header: (
      <InfoTip content={HEADER_GLOSS["RS-Ratio"]}>
        <span>RS-Ratio</span>
      </InfoTip>
    ),
    render: (r) => r.rs_ratio.toFixed(1),
  },
  {
    key: "rs_mom",
    align: "right",
    header: (
      <InfoTip content={HEADER_GLOSS["RS-Mom"]}>
        <span>RS-Mom</span>
      </InfoTip>
    ),
    render: (r) => r.rs_mom.toFixed(1),
  },
  {
    key: "breadth",
    align: "right",
    header: (
      <InfoTip content={HEADER_GLOSS.Breadth}>
        <span>Breadth</span>
      </InfoTip>
    ),
    render: (r) => (Number.isFinite(r.breadth) ? Math.round(r.breadth!) + "%" : "—"),
  },
  {
    key: "n",
    align: "right",
    header: (
      <InfoTip content={HEADER_GLOSS.n}>
        <span>n</span>
      </InfoTip>
    ),
    render: (r) => r.n ?? "—",
  },
  { key: "r1w", align: "right", header: "1W", render: (r) => <Ret v={r.r1w} /> },
  { key: "r1m", align: "right", header: "1M", render: (r) => <Ret v={r.r1m} /> },
  { key: "r3m", align: "right", header: "3M", render: (r) => <Ret v={r.r3m} /> },
];

export default function RotationPanel({ rows, defaultOpen = false, collapsible = true }: RotationPanelProps) {
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
      <DataTable<RotationRow> columns={columns} rows={sorted} rowKey={(r) => r.industry} persistKey="rotation-table" />
    </Panel>
  );
}
