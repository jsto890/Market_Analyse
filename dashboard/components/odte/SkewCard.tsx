"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import Panel from "@/components/ui/Panel";
import InfoTip from "@/components/ui/InfoTip";
import Empty from "@/components/ui/Empty";
import { atmSkew, ivSkewProfile, type SkewPoint } from "@/lib/optionsAnalytics";

const SKEW_TIP =
  "Implied volatility by strike, calls against puts. The gap between the two curves is skew: when puts price above calls the market is paying up for downside protection; when calls price above puts, upside is being chased. The shape matters more than the level — a steep put wing near spot is a different session from a flat one.";

function fmtPct(v: number | null): string {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}

function SkewTooltip({ active, payload }: { active?: boolean; payload?: { payload: SkewPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-line bg-elevated px-3 py-2 text-data shadow-lg">
      <p className="text-foreground">strike {p.strike.toFixed(0)}</p>
      <p className="text-call">call IV {fmtPct(p.callIv)}</p>
      <p className="text-put">put IV {fmtPct(p.putIv)}</p>
      {p.skew != null && (
        <p className={p.skew >= 0 ? "text-put" : "text-call"}>
          skew {p.skew >= 0 ? "+" : ""}
          {(p.skew * 100).toFixed(1)} vol pts
        </p>
      )}
    </div>
  );
}

export default function SkewCard({
  rows,
  spot,
  deltaSkew25,
}: {
  rows: { strike: number; call: { iv: number | null } | null; put: { iv: number | null } | null }[];
  spot: number | null;
  deltaSkew25?: number | null;
}) {
  const points = ivSkewProfile(rows).filter((p) => p.callIv != null || p.putIv != null);
  const atm = atmSkew(points, spot);

  const verdict =
    atm == null
      ? null
      : atm > 0.015
        ? { text: "puts bid — protection is being paid for", tone: "text-put" }
        : atm < -0.015
          ? { text: "calls bid — upside is being chased", tone: "text-call" }
          : { text: "balanced — neither wing is being paid up for", tone: "text-muted" };

  return (
    <Panel
      title="IV skew"
      subtitle={verdict?.text}
      actions={<InfoTip label="How to read the skew curve" content={SKEW_TIP} />}
    >
      {points.length === 0 ? (
        <Empty message="No implied vols in this snapshot." />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11 }} stroke="var(--muted)" />
              <YAxis
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 11 }}
                stroke="var(--muted)"
                width={38}
              />
              <Tooltip content={<SkewTooltip />} />
              {spot != null && <ReferenceLine x={spot} stroke="var(--warn)" strokeDasharray="4 2" />}
              <Line
                type="monotone"
                dataKey="callIv"
                stroke="var(--call)"
                dot={false}
                strokeWidth={1.5}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="putIv"
                stroke="var(--put)"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 flex flex-wrap gap-x-4 text-data">
            <span>
              <span className="text-muted">ATM skew </span>
              <span className={verdict?.tone ?? "text-muted"}>
                {atm != null ? `${atm >= 0 ? "+" : ""}${(atm * 100).toFixed(1)} vol pts` : "—"}
              </span>
            </span>
            {deltaSkew25 != null && (
              <span>
                <span className="text-muted">25Δ risk reversal </span>
                <span className={deltaSkew25 >= 0 ? "text-put" : "text-call"}>
                  {deltaSkew25 >= 0 ? "+" : ""}
                  {(deltaSkew25 * 100).toFixed(1)} vol pts
                </span>
              </span>
            )}
            <span className="text-muted">solid = calls · dashed = puts</span>
          </p>
        </>
      )}
    </Panel>
  );
}
