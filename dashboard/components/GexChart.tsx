"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import Panel from "@/components/ui/Panel";
import Empty from "@/components/ui/Empty";

export interface GexDataPoint {
  strike: number;
  gex: number;
}

export interface GexChartProps {
  data: GexDataPoint[];
  spotStrike?: number | null;
  zeroGammaStrike?: number | null;
}

function formatYAxis(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function GexTooltip({ active, payload }: { active?: boolean; payload?: { payload: GexDataPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-elevated border border-line rounded px-3 py-2 text-data shadow-lg">
      <p className="text-foreground">strike {point.strike.toFixed(0)}</p>
      <p className={point.gex >= 0 ? "text-pos" : "text-neg"}>
        GEX {point.gex >= 0 ? "+" : ""}
        {(point.gex / 1_000_000).toFixed(2)}M
      </p>
    </div>
  );
}

export default function GexChart({ data, spotStrike, zeroGammaStrike }: GexChartProps) {
  if (data.length === 0) {
    return (
      <Panel title="GEX profile">
        <Empty message="No GEX data in this snapshot." />
      </Panel>
    );
  }

  return (
    <Panel title="GEX profile">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="gexPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--green)" stopOpacity={0.5} />
              <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gexNeg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--red)" stopOpacity={0} />
              <stop offset="95%" stopColor="var(--red)" stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="strike" type="number" tick={{ fontSize: 11 }} stroke="var(--muted)" />
          <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} stroke="var(--muted)" />
          <Tooltip content={<GexTooltip />} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          {zeroGammaStrike != null && (
            <ReferenceLine x={zeroGammaStrike} stroke="var(--teal)" strokeDasharray="4 2" />
          )}
          {spotStrike != null && (
            <ReferenceLine x={spotStrike} stroke="var(--warn)" strokeDasharray="4 2" />
          )}
          <Area
            type="monotone"
            dataKey="gex"
            stroke="var(--muted)"
            fill="url(#gexPos)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Panel>
  );
}
