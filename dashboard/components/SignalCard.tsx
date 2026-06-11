"use client";

import type { BridgeRow } from "@/types/bridge";
import { ALIGNMENT_COLOR } from "@/types/bridge";
import ScoreBar from "@/components/ScoreBar";
import ReturnsBar from "@/components/ReturnsBar";
import { useFilterContext } from "@/components/FilterContext";
import { useRouter } from "next/navigation";

interface SignalCardProps {
  row: BridgeRow;
}

const VERDICT_BG: Record<string, string> = {
  LONG: "bg-green-600 text-white",
  SHORT: "bg-red-600 text-white",
  WAIT: "bg-amber-500 text-black",
  NEUTRAL: "bg-gray-700 text-gray-300",
};

export default function SignalCard({ row }: SignalCardProps) {
  const { alignment, hcOnly, search } = useFilterContext();
  const router = useRouter();

  if (hcOnly && !row.high_conviction) return null;
  if (alignment !== "ALL" && row.alignment !== alignment) return null;
  if (search && !row.ticker.toLowerCase().includes(search.toLowerCase())) return null;

  const catalysts =
    row.catalysts && row.catalysts !== "nan"
      ? row.catalysts.split(";").map((c) => c.trim()).filter(Boolean)
      : [];

  const verdictClass = VERDICT_BG[row.argus_verdict] ?? VERDICT_BG.NEUTRAL;

  return (
    <div
      className="rounded border border-[#30363d] py-3 px-4 border-l-4 space-y-2"
      style={{
        backgroundColor: "#161b22",
        borderLeftColor: ALIGNMENT_COLOR[row.alignment],
      }}
    >
      {/* Row 1 — Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-bold text-base text-white tracking-wide">
            {row.ticker}
          </span>
          <span className="text-xs text-gray-400 truncate">{row.setup_label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {row.high_conviction && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
              ⚡ HC
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${verdictClass}`}>
            {row.argus_verdict}
          </span>
        </div>
      </div>

      {/* Row 2 — Scores */}
      <div className="space-y-1">
        <ScoreBar
          value={row.combined_score}
          color={ALIGNMENT_COLOR[row.alignment]}
          label={row.combined_score.toFixed(2)}
        />
        <p className="text-xs text-gray-400 font-mono">
          tech {row.tech_score.toFixed(2)} &middot; sent {row.sentiment_score.toFixed(2)} &middot; agree {row.agreement_pct.toFixed(0)}%
        </p>
      </div>

      {/* Row 3 — Levels */}
      <div className="font-mono text-xs flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="text-white">
          E {row.entry.toFixed(2)}
          {row.is_extended && <span className="text-amber-400 ml-1">(ext)</span>}
        </span>
        <span className="text-red-400">S {row.stop.toFixed(2)}</span>
        <span className="text-green-400">T {row.target.toFixed(2)}</span>
        <span className="text-gray-400">R {row.risk_reward.toFixed(2)}x</span>
      </div>

      {/* Row 4 — Returns */}
      <ReturnsBar
        values={[
          { label: "1D", value: row.ret_1d },
          { label: "1W", value: row.ret_5d },
          { label: "1M", value: row.ret_20d },
          { label: "6M", value: row.ret_126d },
          { label: "1Y", value: row.ret_252d },
        ]}
      />

      {/* Row 5 — Metadata */}
      <p className="text-xs text-gray-500 font-mono">
        quality: {row.quality_score.toFixed(1)} &nbsp; anchor: {row.stop_anchor} &nbsp; entry: {row.entry_quality}
      </p>

      {/* Row 6 — Catalysts */}
      {catalysts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {catalysts.map((cat) => (
            <span
              key={cat}
              className="px-1.5 py-0.5 bg-gray-800 text-gray-300 text-xs rounded"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Row 7 — Action buttons */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => router.push(`/action/${row.ticker}`)}
          className="text-xs text-gray-500 hover:text-white border border-[#30363d] hover:border-gray-500 px-2 py-0.5 rounded transition-colors"
        >
          Analyse &rsaquo;
        </button>
      </div>
    </div>
  );
}
