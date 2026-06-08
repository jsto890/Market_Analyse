"use client";

import { useRouter } from "next/navigation";
import type { BridgeRow } from "@/types/bridge";
import { ALIGNMENT_COLOR } from "@/types/bridge";
import { useFilterContext } from "@/components/FilterContext";

interface SignalTableProps {
  rows: BridgeRow[];
}

const VERDICT_BG: Record<string, string> = {
  LONG: "bg-green-600 text-white",
  SHORT: "bg-red-600 text-white",
  WAIT: "bg-amber-500 text-black",
  NEUTRAL: "bg-gray-700 text-gray-300",
};

function scoreColor(score: number): string {
  if (score > 0.5) return "text-green-400";
  if (score >= 0.3) return "text-amber-400";
  return "text-red-400";
}

function fmtRet(val: number | null): React.ReactNode {
  if (val == null) return <span className="text-gray-600">—</span>;
  return (
    <span className={val >= 0 ? "text-green-400" : "text-red-400"}>
      {val >= 0 ? "+" : ""}{val.toFixed(1)}%
    </span>
  );
}

export default function SignalTable({ rows }: SignalTableProps) {
  const { alignment, hcOnly, search } = useFilterContext();
  const router = useRouter();

  const filtered = rows.filter((r) => {
    if (hcOnly && !r.high_conviction) return false;
    if (alignment !== "ALL" && r.alignment !== alignment) return false;
    if (search && !r.ticker.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="overflow-x-auto rounded border border-[#30363d]">
      <table className="w-full border-collapse text-xs font-mono">
        <thead>
          <tr className="sticky top-0 bg-[#0d1117] text-gray-500 uppercase tracking-wide">
            <th className="py-2 px-2 text-left font-semibold">Align</th>
            <th className="py-2 px-2 text-left font-semibold">Ticker</th>
            <th className="py-2 px-2 text-left font-semibold">Setup</th>
            <th className="py-2 px-2 text-left font-semibold">Verdict</th>
            <th className="py-2 px-2 text-right font-semibold">Score</th>
            <th className="py-2 px-2 text-right font-semibold">Tech</th>
            <th className="py-2 px-2 text-right font-semibold">Sent</th>
            <th className="py-2 px-2 text-right font-semibold">Agree%</th>
            <th className="py-2 px-2 text-center font-semibold">HC</th>
            <th className="py-2 px-2 text-right font-semibold">E</th>
            <th className="py-2 px-2 text-right font-semibold">S</th>
            <th className="py-2 px-2 text-right font-semibold">T</th>
            <th className="py-2 px-2 text-right font-semibold">R:R</th>
            <th className="py-2 px-2 text-right font-semibold">1d</th>
            <th className="py-2 px-2 text-right font-semibold">5d</th>
            <th className="py-2 px-2 text-right font-semibold">20d</th>
            <th className="py-2 px-2 text-left font-semibold">Catalysts</th>
            <th className="py-2 px-2" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, i) => {
            const catalysts =
              row.catalysts && row.catalysts !== "nan"
                ? row.catalysts.split(";").map((c) => c.trim()).filter(Boolean).slice(0, 2)
                : [];
            const verdictClass = VERDICT_BG[row.argus_verdict] ?? VERDICT_BG.NEUTRAL;
            const rowBg = i % 2 === 0 ? "bg-[#161b22]" : "bg-[#0d1117]";

            return (
              <tr
                key={row.ticker}
                className={`${rowBg} hover:bg-[#1f2937] cursor-pointer transition-colors`}
                style={{ borderLeft: `3px solid ${ALIGNMENT_COLOR[row.alignment]}` }}
                onClick={() => router.push(`/action/${row.ticker}`)}
              >
                <td className="py-1.5 px-2 text-gray-500">{row.alignment}</td>
                <td className="py-1.5 px-2 font-bold text-white tracking-wide">{row.ticker}</td>
                <td className="py-1.5 px-2 text-gray-400 max-w-[120px] truncate">{row.setup_label}</td>
                <td className="py-1.5 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${verdictClass}`}>
                    {row.argus_verdict}
                  </span>
                </td>
                <td className={`py-1.5 px-2 text-right ${scoreColor(row.combined_score)}`}>
                  {row.combined_score.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-right text-gray-300">{row.tech_score.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right text-gray-300">{row.sentiment_score.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right text-gray-300">{row.agreement_pct.toFixed(0)}%</td>
                <td className="py-1.5 px-2 text-center">
                  {row.high_conviction ? <span className="text-amber-400">⚡</span> : null}
                </td>
                <td className="py-1.5 px-2 text-right text-white">{row.entry.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right text-red-400">{row.stop.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right text-green-400">{row.target.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right text-gray-400">{row.risk_reward.toFixed(2)}x</td>
                <td className="py-1.5 px-2 text-right">{fmtRet(row.ret_1d)}</td>
                <td className="py-1.5 px-2 text-right">{fmtRet(row.ret_5d)}</td>
                <td className="py-1.5 px-2 text-right">{fmtRet(row.ret_20d)}</td>
                <td className="py-1.5 px-2 text-gray-400 max-w-[140px]">
                  {catalysts.length > 0 ? catalysts.join(", ") : null}
                </td>
                <td className="py-1.5 px-2 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/action/${row.ticker}`);
                    }}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    &rsaquo;
                  </button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={18} className="py-8 text-center text-gray-600">
                No signals match current filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
