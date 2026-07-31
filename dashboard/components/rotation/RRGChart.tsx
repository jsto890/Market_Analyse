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
import Link from "next/link";
import { useState } from "react";
import Panel from "@/components/ui/Panel";
import Empty from "@/components/ui/Empty";
import type { RotationRow } from "@/components/today/RotationPanel";
import { QUADRANT_COLOR, deriveQuadrant, splitDegenerate } from "@/lib/rotation";
import { CHART_HEIGHT, CHART_AXIS_STYLE } from "@/lib/chartConventions";
import { QUADRANT_GLOSS, QUADRANT_LABEL } from "@/lib/labels";

/** Tickers on today's list, keyed by the industry the bridge assigned them —
 *  the same vocabulary the rotation rows use. */
export type SectorNames = Record<string, { ticker: string; action_label?: string }[]>;

type QuadrantKey = keyof typeof QUADRANT_LABEL;

/**
 * The quadrant word plus what it means, drawn into the corner it names. A
 * legend under the chart would print all four words a second time, which is the
 * duplication this overhaul is removing everywhere else — so the gloss goes
 * where the word already is (RO-10). recharts hands a label element the area's
 * own `viewBox`, which is what positions it in the right corner.
 */
function QuadrantLabel({
  quadrant, color, corner, viewBox,
}: {
  quadrant: QuadrantKey;
  color: string;
  corner: "TopRight" | "TopLeft" | "BottomRight" | "BottomLeft";
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}) {
  const { x = 0, y = 0, width = 0, height = 0 } = viewBox ?? {};
  const right = corner.endsWith("Right");
  const bottom = corner.startsWith("Bottom");
  const tx = right ? x + width - 6 : x + 6;
  const ty = bottom ? y + height - 16 : y + 14;
  return (
    <g>
      <text x={tx} y={ty} textAnchor={right ? "end" : "start"} fontSize={11} fill={color}>
        {QUADRANT_LABEL[quadrant]}
      </text>
      {/* SVG text does not wrap, and the quadrants are as lopsided as the data
          — a tight cluster on one side of 100 leaves its quadrant ~120px wide.
          The gloss is anchored to the outer corner, so a narrow quadrant lets it
          reach a little into the empty middle rather than dropping it; only a
          sliver gets the bare word. */}
      {width > 100 && (
        <text
          x={tx}
          y={ty + 12}
          textAnchor={right ? "end" : "start"}
          fontSize={10}
          fill={CHART_AXIS_STYLE.tick}
        >
          {QUADRANT_GLOSS[quadrant]}
        </text>
      )}
    </g>
  );
}

interface TooltipPayloadItem {
  payload: RotationRow & { quadrantKey: string };
}

function RRGTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded border border-line bg-elevated px-2.5 py-1.5 text-body shadow-lg">
      <div className="font-medium text-foreground">{row.industry}</div>
      <div className="text-muted">
        {QUADRANT_LABEL[row.quadrantKey as keyof typeof QUADRANT_LABEL] ?? row.quadrantKey}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 text-muted">
        <span>RS-Ratio</span>
        <span className="text-right text-data text-foreground">{row.rs_ratio.toFixed(2)}</span>
        <span>RS-Mom</span>
        <span className="text-right text-data text-foreground">{row.rs_mom.toFixed(2)}</span>
        {row.r1w != null && (
          <>
            <span>1W</span>
            <span className="text-right text-data text-foreground">{row.r1w.toFixed(2)}%</span>
          </>
        )}
        {row.r1m != null && (
          <>
            <span>1M</span>
            <span className="text-right text-data text-foreground">{row.r1m.toFixed(2)}%</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function RRGChart({
  rows,
  namesBySector,
}: {
  rows: RotationRow[];
  /** Omitted when the signals file could not be read — the picked-names line
   *  then never renders, rather than claiming every sector is empty. */
  namesBySector?: SectorNames;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!rows.length) return null;

  const { plotted, hidden } = splitDegenerate(rows);
  if (!plotted.length) {
    return (
      <Panel title="Relative Rotation Graph" subtitle="RS-Ratio vs RS-Momentum">
        <Empty message="No sector data available — the rotation job returned no populated sectors." />
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

  const data = plotted.map((r, i) => ({
    ...r,
    quadrantKey: deriveQuadrant(r),
    rrgIndex: i + 1,
  }));

  const selectedRow = data.find((r) => r.industry === selected) ?? null;
  const picked = selectedRow ? (namesBySector?.[selectedRow.industry] ?? []) : [];

  return (
    <Panel
      title="Relative Rotation Graph"
      subtitle={`RS-Ratio vs RS-Momentum · ${plotted.length} sectors${
        hidden.length > 0 ? ` · ${hidden.length} hidden (no data)` : ""
      }`}
    >
      <div
        role="img"
        aria-label={`Relative Rotation Graph scatter plot, ${plotted.length} sectors`}
        style={{ width: "100%", height: CHART_HEIGHT }}
      >
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
              label={<QuadrantLabel quadrant="leading" color="var(--green)" corner="TopRight" />}
            />
            <ReferenceArea
              x1={xDomain[0]}
              x2={100}
              y1={100}
              y2={yDomain[1]}
              fill="var(--teal)"
              fillOpacity={0.08}
              stroke="none"
              label={<QuadrantLabel quadrant="improving" color="var(--teal)" corner="TopLeft" />}
            />
            <ReferenceArea
              x1={100}
              x2={xDomain[1]}
              y1={yDomain[0]}
              y2={100}
              fill="var(--amber)"
              fillOpacity={0.08}
              stroke="none"
              label={<QuadrantLabel quadrant="weakening" color="var(--amber)" corner="BottomRight" />}
            />
            <ReferenceArea
              x1={xDomain[0]}
              x2={100}
              y1={yDomain[0]}
              y2={100}
              fill="var(--red)"
              fillOpacity={0.08}
              stroke="none"
              label={<QuadrantLabel quadrant="lagging" color="var(--red)" corner="BottomLeft" />}
            />

            <CartesianGrid stroke={CHART_AXIS_STYLE.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="rs_ratio"
              domain={xDomain}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: CHART_AXIS_STYLE.tick, fontSize: 11 }}
              stroke={CHART_AXIS_STYLE.axisLine}
              label={{ value: "RS-Ratio", position: "insideBottom", offset: -4, fill: CHART_AXIS_STYLE.tick, fontSize: 13 }}
            />
            <YAxis
              type="number"
              dataKey="rs_mom"
              domain={yDomain}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: CHART_AXIS_STYLE.tick, fontSize: 11 }}
              stroke={CHART_AXIS_STYLE.axisLine}
              label={{ value: "RS-Momentum", angle: -90, position: "insideLeft", fill: CHART_AXIS_STYLE.tick, fontSize: 13 }}
            />
            <ZAxis range={[80, 80]} />
            <ReferenceLine x={100} stroke={CHART_AXIS_STYLE.referenceLine} />
            <ReferenceLine y={100} stroke={CHART_AXIS_STYLE.referenceLine} />

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
                const isSelected = selected === p.payload.industry;
                return (
                  <g
                    onClick={() =>
                      setSelected(isSelected ? null : (p.payload as RotationRow).industry)
                    }
                    style={{ cursor: "pointer" }}
                  >
                    {isSelected && (
                      <circle cx={p.cx} cy={p.cy} r={8} fill="none" stroke={color} strokeWidth={1.5} />
                    )}
                    <circle cx={p.cx} cy={p.cy} r={4} fill={color} stroke="var(--bg)" strokeWidth={1} />
                    {/* Index only — the name goes in the keyed legend below.
                     * Naming just the uncrowded points was both inconsistent
                     * (2 of 12 labelled) and unreadable: an abbreviated sector
                     * name still ellipsised, so it named nothing the legend
                     * didn't already name in full. */}
                    <text
                      x={p.cx + (right ? 7 : -7)}
                      y={p.cy + (up ? -3 : 9)}
                      fontSize={11}
                      fill={CHART_AXIS_STYLE.pointLabel}
                      textAnchor={right ? "start" : "end"}
                      style={{
                        paintOrder: "stroke",
                        stroke: "var(--bg)",
                        strokeWidth: 3,
                        strokeLinejoin: "round",
                      }}
                    >
                      {p.payload.rrgIndex}
                    </text>
                  </g>
                );
              }}
            />

          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {/* Keyed legend — every plotted sector is named exactly once, so a
       * cluster near the origin stays identifiable without hovering. */}
      <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1 px-1 text-body md:grid-cols-3">
        {data.map((r) => (
          <li key={r.industry} className="flex min-w-0">
            {/* The legend is also the picker: a scatter dot is a 4px target,
             *  and the sector's name is here rather than there (RO-11). */}
            <button
              type="button"
              onClick={() => setSelected(selected === r.industry ? null : r.industry)}
              aria-pressed={selected === r.industry}
              className={`flex min-w-0 items-center gap-1.5 rounded px-1 text-left hover:text-foreground ${
                selected === r.industry ? "text-foreground" : "text-muted"
              }`}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ background: QUADRANT_COLOR[r.quadrantKey] ?? "var(--accent)" }}
              />
              <span className="w-5 flex-shrink-0 text-right text-data text-muted">{r.rrgIndex}</span>
              <span className="truncate">{r.industry}</span>
            </button>
          </li>
        ))}
      </ul>
      {selectedRow && namesBySector && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-line px-1 pt-2 text-body">
          <span className="eyebrow">{selectedRow.industry} · on today&rsquo;s list</span>
          {picked.length > 0 ? (
            picked.map((n) => (
              <Link
                key={n.ticker}
                href={`/t/${n.ticker}`}
                className="rounded border border-line px-1.5 py-px font-mono text-micro text-accent hover:bg-elevated"
              >
                {n.ticker}
              </Link>
            ))
          ) : (
            <span className="text-muted">
              Nothing from this sector made today&rsquo;s list — the rotation is there, the setups
              are not.
            </span>
          )}
        </div>
      )}
      {hidden.length > 0 && (
        <p className="mt-2 px-1 text-body text-muted">
          Hidden (flat/no data): {hidden.map((r) => r.industry).join(", ")}
        </p>
      )}
    </Panel>
  );
}
