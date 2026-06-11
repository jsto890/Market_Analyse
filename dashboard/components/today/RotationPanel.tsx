"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import Panel from "@/components/ui/Panel";

export interface RotationRow {
  industry: string;
  quadrant: "leading" | "improving" | "weakening" | "lagging" | string;
  rs_ratio: number;
  rs_mom: number;
  breadth: number;
  n: number;
  r1w: number;
  r1m: number;
  r3m: number;
  rank: number;
  drank: number | null;
}

interface RotationPanelProps {
  rows: RotationRow[];
}

const QUADRANT_TONE: Record<string, { color: string; label: string }> = {
  leading: { color: "var(--green)", label: "Leading" },
  improving: { color: "var(--teal)", label: "Improving" },
  weakening: { color: "var(--amber)", label: "Weakening" },
  lagging: { color: "var(--red)", label: "Lagging" },
};

const DRANK_TOOLTIP = "~72% of ±1 moves are noise";
const THIN_TOOLTIP =
  "thin basket — displayed RS values are noisier than the (shrinkage-adjusted) rank suggests";
const BREADTH_TOOLTIP =
  "% above 50-DMA — Improving + low breadth = one-name move, unconfirmed";

function Th({
  children,
  align = "left",
  tooltip,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  tooltip?: string;
}) {
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const inner = (
    <span className={tooltip ? "cursor-default border-b border-dotted border-muted/50" : ""}>
      {children}
    </span>
  );
  return (
    <th
      className={`px-2 py-1.5 font-medium text-muted border-b border-line whitespace-nowrap ${alignCls}`}
    >
      {tooltip ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{inner}</Tooltip.Trigger>
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
      ) : (
        inner
      )}
    </th>
  );
}

function QuadrantDot({ quadrant }: { quadrant: string }) {
  const tone = QUADRANT_TONE[quadrant] ?? { color: "var(--muted)", label: quadrant };
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex cursor-default items-center justify-center">
          <span
            className="block h-2.5 w-2.5 rounded-full"
            style={{ background: tone.color }}
          />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          {tone.label}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function DRank({ drank }: { drank: number | null }) {
  if (drank === null || Math.abs(drank) < 2) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="cursor-default text-muted">•</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
            sideOffset={4}
          >
            {DRANK_TOOLTIP}
            <Tooltip.Arrow className="fill-elevated" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
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

function Ret({ v }: { v: number }) {
  if (!Number.isFinite(v)) return <span className="text-muted">—</span>;
  const sign = v >= 0 ? "+" : "";
  return (
    <span className={v >= 0 ? "text-pos" : "text-neg"}>
      {sign}
      {v.toFixed(1)}
    </span>
  );
}

export default function RotationPanel({ rows }: RotationPanelProps) {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const fading = rows.filter(
    (r) => r.quadrant === "weakening" || r.quadrant === "lagging"
  ).length;
  const leading = sorted
    .filter((r) => r.quadrant === "leading")
    .slice(0, 2)
    .map((r) => r.industry);
  const leadingText =
    leading.length > 0 ? `Leading: ${leading.join(", ")}` : "Leading: none";
  const summary = `${leadingText} · ${fading}/${rows.length} fading`;

  return (
    <Panel
      title="Sector rotation"
      subtitle={summary}
      collapsible
      defaultOpen={false}
      persistKey="rotation"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th>Industry</Th>
              <Th align="center" tooltip={DRANK_TOOLTIP}>
                Δrank
              </Th>
              <Th align="center">◉</Th>
              <Th align="right">RS-Ratio</Th>
              <Th align="right">RS-Mom</Th>
              <Th align="right" tooltip={BREADTH_TOOLTIP}>
                Breadth
              </Th>
              <Th align="right">n</Th>
              <Th align="right">1W</Th>
              <Th align="right">1M</Th>
              <Th align="right">3M</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const thin = r.n < 20;
              const rowCls = thin ? "text-muted" : "";
              const industryCell = thin ? (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <span className="cursor-default border-b border-dotted border-muted/50">
                      {r.industry}
                    </span>
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
              );
              return (
                <tr key={r.industry} className={`border-b border-line ${rowCls}`}>
                  <td className="px-2 py-1.5">{industryCell}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums font-mono">
                    <DRank drank={r.drank} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <QuadrantDot quadrant={r.quadrant} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                    {r.rs_ratio.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                    {r.rs_mom.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                    {Math.round(r.breadth)}%
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono">{r.n}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                    <Ret v={r.r1w} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                    <Ret v={r.r1m} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                    <Ret v={r.r3m} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
