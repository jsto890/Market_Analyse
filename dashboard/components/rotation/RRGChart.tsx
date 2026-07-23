"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Tooltip,
} from "recharts";
import Panel from "@/components/ui/Panel";
import type { RotationRow } from "@/components/today/RotationPanel";

const QUADRANT_COLOR: Record<string, string> = {
  leading: "var(--green)",
  improving: "var(--teal)",
  weakening: "var(--amber)",
  lagging: "var(--red)",
};

const QUADRANT_LABEL: Record<string, string> = {
  leading: "Leading",
  improving: "Improving",
  weakening: "Weakening",
  lagging: "Lagging",
};

function deriveQuadrant(row: RotationRow): string {
  if (row.quadrant in QUADRANT_COLOR) return row.quadrant;
  if (row.rs_ratio >= 100 && row.rs_mom >= 100) return "leading";
  if (row.rs_ratio < 100 && row.rs_mom >= 100) return "improving";
  if (row.rs_ratio >= 100 && row.rs_mom < 100) return "weakening";
  return "lagging";
}

function abbreviate(name: string, max = 10): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

interface TooltipPayloadItem {
  payload: RotationRow & { quadrantKey: string };
}

function RRGTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-lg">
      <div className="font-medium text-text">{row.industry}</div>
      <div className="text-muted">{QUADRANT_LABEL[row.quadrantKey] ?? row.quadrantKey}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 text-muted">
        <span>RS-Ratio</span>
        <span className="text-right text-text">{row.rs_ratio.toFixed(2)}</span>
        <span>RS-Mom</span>
        <span className="text-right text-text">{row.rs_mom.toFixed(2)}</span>
        {row.r1w != null && (
          <>
            <span>1W</span>
            <span className="text-right text-text">{row.r1w.toFixed(2)}%</span>
          </>
        )}
        {row.r1m != null && (
          <>
            <span>1M</span>
            <span className="text-right text-text">{row.r1m.toFixed(2)}%</span>
          </>
        )}
      </div>
    </div>
  );
}

// Sectors whose relative-strength line is flat (constituent closes failed to
// load) come out exactly at 100/100 — meaningless points that pile up on the
// origin and collide. Drop them from the plot.
function isDegenerate(r: RotationRow): boolean {
  return Math.abs(r.rs_ratio - 100) < 0.05 && Math.abs(r.rs_mom - 100) < 0.05;
}

export default function RRGChart({ rows }: { rows: RotationRow[] }) {
  if (!rows.length) return null;

  const plotted = rows.filter((r) => !isDegenerate(r));
  const hidden = rows.length - plotted.length;
  if (!plotted.length) {
    return (
      <Panel title="Relative Rotation Graph" subtitle="RS-Ratio vs RS-Momentum">
        <p className="px-1 py-6 text-center text-[13px] text-muted">
          No sector data available — the rotation job returned no populated sectors.
        </p>
      </Panel>
    );
  }

  const ratios = plotted.map((r) => r.rs_ratio);
  const moms = plotted.map((r) => r.rs_mom);
  const minR = Math.min(...ratios, 100);
  const maxR = Math.max(...ratios, 100);
  const minM = Math.min(...moms, 100);
  const maxM = Math.max(...moms, 100);

  const padR = Math.max((maxR - minR) * 0.15, 0.5);
  const padM = Math.max((maxM - minM) * 0.15, 0.5);

  const xDomain: [number, number] = [minR - padR, maxR + padR];
  const yDomain: [number, number] = [minM - padM, maxM + padM];

  const data = plotted.map((r) => ({ ...r, quadrantKey: deriveQuadrant(r) }));

  return (
    <Panel
      title="Relative Rotation Graph"
      subtitle={`RS-Ratio vs RS-Momentum · ${plotted.length} sectors${
        hidden > 0 ? ` · ${hidden} hidden (no data)` : ""
      }`}
    >
      <div style={{ width: "100%", height: 420 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <ReferenceArea
              x1={100}
              x2={xDomain[1]}
              y1={100}
              y2={yDomain[1]}
              fill="var(--green)"
              fillOpacity={0.08}
              stroke="none"
              label={{ value: "Leading", position: "insideTopRight", fill: "var(--green)", fontSize: 11 }}
            />
            <ReferenceArea
              x1={xDomain[0]}
              x2={100}
              y1={100}
              y2={yDomain[1]}
              fill="var(--teal)"
              fillOpacity={0.08}
              stroke="none"
              label={{ value: "Improving", position: "insideTopLeft", fill: "var(--teal)", fontSize: 11 }}
            />
            <ReferenceArea
              x1={100}
              x2={xDomain[1]}
              y1={yDomain[0]}
              y2={100}
              fill="var(--amber)"
              fillOpacity={0.08}
              stroke="none"
              label={{ value: "Weakening", position: "insideBottomRight", fill: "var(--amber)", fontSize: 11 }}
            />
            <ReferenceArea
              x1={xDomain[0]}
              x2={100}
              y1={yDomain[0]}
              y2={100}
              fill="var(--red)"
              fillOpacity={0.08}
              stroke="none"
              label={{ value: "Lagging", position: "insideBottomLeft", fill: "var(--red)", fontSize: 11 }}
            />

            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="rs_ratio"
              domain={xDomain}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: "#8b93a3", fontSize: 11 }}
              stroke="var(--border)"
              label={{ value: "RS-Ratio", position: "insideBottom", offset: -4, fill: "#8b93a3", fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="rs_mom"
              domain={yDomain}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: "#8b93a3", fontSize: 11 }}
              stroke="var(--border)"
              label={{ value: "RS-Momentum", angle: -90, position: "insideLeft", fill: "#8b93a3", fontSize: 11 }}
            />
            <ZAxis range={[80, 80]} />
            <ReferenceLine x={100} stroke="var(--border)" />
            <ReferenceLine y={100} stroke="var(--border)" />

            <Tooltip content={<RRGTooltip />} cursor={{ strokeDasharray: "3 3" }} />

            <Scatter
              data={data}
              isAnimationActive={false}
              shape={(props: unknown) => {
                const p = props as { cx?: number; cy?: number; payload?: (typeof data)[number] };
                if (p.cx == null || p.cy == null || !p.payload) return <g />;
                const color = QUADRANT_COLOR[p.payload.quadrantKey] ?? "var(--accent)";
                // Push the label outward from the 100/100 origin (right/left,
                // up/down by quadrant) to reduce central label collision, and
                // give it a bg halo so overlaps stay readable.
                const right = p.payload.rs_ratio >= 100;
                const up = p.payload.rs_mom >= 100;
                return (
                  <g>
                    <circle cx={p.cx} cy={p.cy} r={4} fill={color} stroke="var(--bg)" strokeWidth={1} />
                    <text
                      x={p.cx + (right ? 7 : -7)}
                      y={p.cy + (up ? -3 : 9)}
                      fontSize={10}
                      fill="#c3c9d4"
                      textAnchor={right ? "start" : "end"}
                      style={{
                        paintOrder: "stroke",
                        stroke: "var(--bg)",
                        strokeWidth: 3,
                        strokeLinejoin: "round",
                      }}
                    >
                      {abbreviate(p.payload.industry)}
                    </text>
                  </g>
                );
              }}
            />

          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
