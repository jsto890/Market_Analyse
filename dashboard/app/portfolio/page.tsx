"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface PositionRow {
  symbol: string;
  position: number | null;
  avg_cost: number | null;
  verdict?: string;
  score?: number;
  edge?: string;
  high_conviction?: boolean;
  ibkr_offline?: boolean;
  error?: string;
}

// /api/portfolio returns a bare list. When IBKR is unreachable and the yf
// fallback also yields nothing, it returns [{ error, ibkr_offline }].
type ApiResponse = PositionRow[] | { error: string };

function isList(r: ApiResponse | undefined): r is PositionRow[] {
  return Array.isArray(r);
}

function isErrorSentinel(rows: PositionRow[]): boolean {
  return rows.length === 1 && rows[0].error != null && rows[0].symbol == null;
}

function verdictChip(verdict: string | undefined): React.ReactNode {
  if (!verdict) return <span className="text-gray-600">—</span>;
  const cls =
    verdict === "LONG"
      ? "bg-green-900/50 text-green-400 border border-green-800"
      : verdict === "SHORT"
      ? "bg-red-900/50 text-red-400 border border-red-800"
      : "bg-amber-900/50 text-amber-400 border border-amber-800";
  return (
    <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {verdict}
    </span>
  );
}

function scoreClass(s: number | undefined): string {
  if (s == null) return "text-gray-400";
  if (s > 0) return "text-green-400";
  if (s < 0) return "text-red-400";
  return "text-gray-400";
}

export default function PortfolioPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<ApiResponse>(
    "/api/argus/portfolio",
    fetcher,
    { refreshInterval: 60000 }
  );

  const rows = isList(data) ? data : [];
  const offline = !isList(data) || isErrorSentinel(rows);
  const liveOffline = rows.some((r) => r.ibkr_offline);
  const positions = offline ? [] : rows;
  const isEmpty = !isLoading && isList(data) && !offline && positions.length === 0;

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Portfolio</h1>

        {isLoading && <p className="text-xs font-mono text-gray-500">Loading…</p>}

        {!isLoading && offline && (
          <div className="bg-[#161b22] border border-[#30363d] rounded p-8 text-center space-y-3 max-w-md">
            <p className="text-sm font-semibold text-gray-200">IBKR Gateway Offline</p>
            <p className="text-xs text-gray-500">
              Connect IBKR Gateway on port 4002 to see live positions.
            </p>
            <button
              onClick={() => void mutate()}
              className="text-xs bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 px-4 py-1.5 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && isEmpty && (
          <p className="text-sm text-gray-500">No open positions.</p>
        )}

        {!isLoading && !offline && positions.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500 font-mono">
                {positions.length} position{positions.length !== 1 ? "s" : ""}
              </p>
              {liveOffline && (
                <span className="text-[10px] font-mono text-amber-500/80">
                  watchlist fallback (IBKR offline)
                </span>
              )}
            </div>
            <div className="bg-[#161b22] border border-[#30363d] rounded p-4 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-[#30363d]">
                    <th className="pb-1.5 pr-4 font-medium">Symbol</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Position</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Avg Cost</th>
                    <th className="pb-1.5 pr-4 font-medium">Argus</th>
                    <th className="pb-1.5 pr-4 font-medium text-right">Score</th>
                    <th className="pb-1.5 pr-4 font-medium">Edge</th>
                    <th className="pb-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, i) => {
                    const rowBg = i % 2 === 0 ? "" : "bg-white/[0.02]";
                    const posClass =
                      pos.position == null
                        ? "text-gray-500"
                        : pos.position > 0
                        ? "text-green-400"
                        : pos.position < 0
                        ? "text-red-400"
                        : "text-gray-400";
                    return (
                      <tr
                        key={pos.symbol}
                        className={`${rowBg} hover:bg-gray-800/30 transition-colors`}
                      >
                        <td className="py-1.5 pr-4 font-mono font-semibold text-white">
                          {pos.symbol}
                        </td>
                        <td className={`py-1.5 pr-4 text-right tabular-nums font-mono ${posClass}`}>
                          {pos.position == null ? "—" : pos.position}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums text-gray-300 font-mono">
                          {pos.avg_cost == null ? "—" : `$${pos.avg_cost.toFixed(2)}`}
                        </td>
                        <td className="py-1.5 pr-4">{verdictChip(pos.verdict)}</td>
                        <td className={`py-1.5 pr-4 text-right tabular-nums font-mono ${scoreClass(pos.score)}`}>
                          {pos.score == null ? "—" : pos.score.toFixed(2)}
                        </td>
                        <td className="py-1.5 pr-4 font-mono text-xs text-gray-400">
                          {pos.edge ?? "—"}
                        </td>
                        <td className="py-1.5">
                          <button
                            onClick={() => router.push(`/t/${pos.symbol}`)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-mono"
                          >
                            ›
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
