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

const THIN_TOOLTIP =
  "thin basket — displayed RS values are noisier than the (shrinkage-adjusted) rank suggests";
const BREADTH_TOOLTIP =
  "% above 50-DMA — Improving + low breadth = one-name move, unconfirmed";

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
          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
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

function GlossedHeader({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="cursor-default border-b border-dotted border-muted/50">{label}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          {tooltip}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const columns: Column<RotationRow>[] = [
  {
    key: "industry",
    header: "Industry",
    render: (r) =>
      r.n != null && r.n < 20 ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span className="cursor-default border-b border-dotted border-muted/50">{r.industry}</span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
              sideOffset={4}
            >
              {THIN_TOOLTIP}
              <Tooltip.Arrow className="fill-elevated" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        r.industry
      ),
  },
  {
    key: "drank",
    header: <GlossedHeader label="Δrank" tooltip={HEADER_GLOSS["Δrank"]} />,
    align: "center",
    render: (r) => <DRank drank={r.drank} />,
  },
  { key: "quadrant", header: "◉", align: "center", render: (r) => <QuadrantDot quadrant={r.quadrant} /> },
  { key: "rs_ratio", align: "right", header: "RS-Ratio", render: (r) => r.rs_ratio.toFixed(1) },
  { key: "rs_mom", align: "right", header: "RS-Mom", render: (r) => r.rs_mom.toFixed(1) },
  {
    key: "breadth",
    align: "right",
    header: <GlossedHeader label="Breadth" tooltip={BREADTH_TOOLTIP} />,
    render: (r) => (Number.isFinite(r.breadth) ? Math.round(r.breadth!) + "%" : "—"),
  },
  { key: "n", align: "right", header: "n", render: (r) => r.n ?? "—" },
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
