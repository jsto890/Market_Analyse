"use client";

import { useRouter } from "next/navigation";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BridgeRow, Alignment } from "@/types/bridge";
import { ALIGNMENT_COLOR } from "@/types/bridge";
import { useFilterContext } from "@/components/FilterContext";

interface AlignmentCompassProps {
  rows: BridgeRow[];
}

interface TooltipPayload {
  payload: {
    ticker: string;
    argus_verdict: string;
    combined_score: number;
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-xs font-mono">
      <div className="text-white font-bold">{d.ticker}</div>
      <div className="text-gray-400">{d.argus_verdict}</div>
      <div className="text-gray-300">score {d.combined_score.toFixed(2)}</div>
    </div>
  );
}

const ALIGNMENTS: Alignment[] = ["ALIGNED", "CONTRARIAN", "DIVERGING", "TECH_WAIT", "NEUTRAL"];

export default function AlignmentCompass({ rows }: AlignmentCompassProps) {
  const { compassOpen, setCompassOpen } = useFilterContext();
  const router = useRouter();

  if (!compassOpen) return null;

  const byAlignment = ALIGNMENTS.reduce<Record<Alignment, BridgeRow[]>>(
    (acc, a) => {
      acc[a] = rows.filter((r) => r.alignment === a);
      return acc;
    },
    {} as Record<Alignment, BridgeRow[]>
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => setCompassOpen(false)}
    >
      <div
        className="bg-[#161b22] border border-[#30363d] rounded p-4 w-[600px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">Alignment Compass</span>
          <button
            onClick={() => setCompassOpen(false)}
            className="text-gray-500 hover:text-white text-lg leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          {ALIGNMENTS.map((a) => (
            <span key={a} className="flex items-center gap-1 text-xs text-gray-400">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: ALIGNMENT_COLOR[a] }}
              />
              {a}
            </span>
          ))}
          <span className="text-xs text-gray-600 ml-2">⚡ = HC (larger dot)</span>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis
              dataKey="tech_score"
              type="number"
              domain={[-1, 1]}
              tickCount={5}
              stroke="#6b7280"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              label={{ value: "Technical", position: "insideBottom", offset: -15, fill: "#6b7280", fontSize: 11 }}
            />
            <YAxis
              dataKey="sentiment_score"
              type="number"
              domain={[-1, 1]}
              tickCount={5}
              stroke="#6b7280"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              label={{ value: "Sentiment", angle: -90, position: "insideLeft", offset: 15, fill: "#6b7280", fontSize: 11 }}
            />
            <ReferenceLine x={0} stroke="#30363d" strokeDasharray="4 4" />
            <ReferenceLine y={0} stroke="#30363d" strokeDasharray="4 4" />
            <Tooltip content={<CustomTooltip />} />
            {ALIGNMENTS.map((a) => (
              <Scatter
                key={a}
                name={a}
                data={byAlignment[a]}
                fill={ALIGNMENT_COLOR[a]}
                fillOpacity={0.8}
                shape={(props: { cx?: number; cy?: number; payload?: BridgeRow }) => {
                  const { cx = 0, cy = 0, payload } = props;
                  const r = payload?.high_conviction ? 6 : 4;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={ALIGNMENT_COLOR[a]}
                      fillOpacity={0.85}
                      stroke={ALIGNMENT_COLOR[a]}
                      strokeWidth={1}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (payload?.ticker) {
                          router.push(`/action/${payload.ticker}`);
                          setCompassOpen(false);
                        }
                      }}
                    />
                  );
                }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
