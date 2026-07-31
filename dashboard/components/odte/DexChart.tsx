"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import Panel from "@/components/ui/Panel";
import InfoTip from "@/components/ui/InfoTip";
import { dexProfile, type DexPoint } from "@/lib/optionsAnalytics";
import type { StrikeLevel } from "@/lib/optionsLive";

const DEX_TIP =
  "Dealer delta exposure: callΔ×callOI − putΔ×putOI at each strike, in notional dollars. Bars are the delta booked at that strike; the line is the running total from the lowest strike up. Where the line crosses zero is the price at which dealers are, in aggregate, flat — above it they are net long and sell into strength, below it they are net short and buy into weakness.";

function fmtAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(0)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function DexTooltip({ active, payload }: { active?: boolean; payload?: { payload: DexPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-line bg-elevated px-3 py-2 font-mono text-micro shadow-lg">
      <p className="text-foreground">strike {p.strike.toFixed(0)}</p>
      <p className={p.dex >= 0 ? "text-pos" : "text-neg"}>at strike {fmtAxis(p.dex)}</p>
      <p className="text-muted">cumulative {fmtAxis(p.cumulative)}</p>
    </div>
  );
}

export default function DexChart({
  levels,
  spot,
}: {
  levels: StrikeLevel[];
  spot: number | null;
}) {
  const { points, flipStrike, total } = dexProfile(levels, spot);

  return (
    <Panel
      title="DEX profile"
      subtitle={
        flipStrike != null
          ? `dealers flat near ${flipStrike.toFixed(0)}`
          : "no zero crossing in range"
      }
      actions={<InfoTip label="What the DEX profile shows" content={DEX_TIP} />}
    >
      {points.length === 0 ? (
        <p className="font-mono text-micro text-muted">
          no greeks in this snapshot — turn the live ladder on
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={points} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11 }} stroke="var(--muted)" />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} stroke="var(--muted)" />
              <Tooltip content={<DexTooltip />} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              {flipStrike != null && (
                <ReferenceLine x={flipStrike} stroke="var(--teal)" strokeDasharray="4 2" />
              )}
              {spot != null && <ReferenceLine x={spot} stroke="var(--warn)" strokeDasharray="4 2" />}
              <Bar dataKey="dex" fill="var(--muted)" fillOpacity={0.45} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="var(--teal)"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-2 font-mono text-micro text-muted">
            net dealer delta{" "}
            <span className={total >= 0 ? "text-pos" : "text-neg"}>{fmtAxis(total)}</span>
            <span className="ml-2 text-muted-2">
              teal = dealers flat · amber = spot
            </span>
          </p>
        </>
      )}
    </Panel>
  );
}
