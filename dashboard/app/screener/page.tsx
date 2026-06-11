"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScreenerResult } from "@/types/argus";

function verdictColor(v: string): string {
  if (v === "LONG") return "text-green-400";
  if (v === "SHORT") return "text-red-400";
  return "text-amber-400";
}

function scoreColor(s: number): string {
  if (s >= 0.7) return "text-green-400";
  if (s >= 0.5) return "text-amber-400";
  return "text-gray-400";
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function RetCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-600">—</span>;
  const cls = v >= 0 ? "text-green-400" : "text-red-400";
  return <span className={cls}>{fmtPct(v)}</span>;
}

function ResultsTable({
  results,
  onDrill,
}: {
  results: ScreenerResult[];
  onDrill: (symbol: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-[#30363d]">
            <th className="pb-1.5 pr-3 font-medium">Ticker</th>
            <th className="pb-1.5 pr-3 font-medium">Verdict</th>
            <th className="pb-1.5 pr-3 font-medium text-right">Score</th>
            <th className="pb-1.5 pr-3 font-medium text-right">L</th>
            <th className="pb-1.5 pr-3 font-medium text-right">S</th>
            <th className="pb-1.5 pr-3 font-medium text-right">W</th>
            <th className="pb-1.5 pr-3 font-medium text-right">Agree%</th>
            <th className="pb-1.5 pr-3 font-medium text-center">HC</th>
            <th className="pb-1.5 pr-3 font-medium text-right">R:R</th>
            <th className="pb-1.5 pr-3 font-medium text-right">1d%</th>
            <th className="pb-1.5 pr-3 font-medium text-right">5d%</th>
            <th className="pb-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const rowBg = i % 2 === 0 ? "" : "bg-white/[0.02]";
            return (
              <tr
                key={r.symbol}
                className={`${rowBg} hover:bg-gray-800/30 transition-colors`}
              >
                <td className="py-1.5 pr-3 font-mono font-semibold text-white">
                  {r.symbol}
                </td>
                <td className={`py-1.5 pr-3 font-mono font-semibold ${verdictColor(r.verdict)}`}>
                  {r.verdict}
                </td>
                <td className={`py-1.5 pr-3 text-right tabular-nums font-mono ${scoreColor(r.score)}`}>
                  {r.score.toFixed(3)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-green-400">
                  {r.long_votes}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-red-400">
                  {r.short_votes}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-amber-400">
                  {r.wait_votes}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-300">
                  {r.agreement_pct.toFixed(0)}%
                </td>
                <td className="py-1.5 pr-3 text-center">
                  {r.high_conviction ? (
                    <span className="text-amber-400 font-bold">HC</span>
                  ) : (
                    <span className="text-gray-700">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-300">
                  {r.risk_reward.toFixed(1)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  <RetCell v={r.ret_1d} />
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  <RetCell v={r.ret_5d} />
                </td>
                <td className="py-1.5">
                  <button
                    onClick={() => onDrill(r.symbol)}
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
  );
}

type ApiResponse = { results: ScreenerResult[] } | { error: string };

function isErrorResponse(r: ApiResponse): r is { error: string } {
  return "error" in r;
}

export default function ScreenerPage() {
  const router = useRouter();
  const [tickerInput, setTickerInput] = useState("");
  const [minScore, setMinScore] = useState("0.3");
  const [results, setResults] = useState<ScreenerResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runScreener(tickers: string[] | null) {
    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (tickers === null) {
        res = await fetch("/api/argus/screener");
      } else {
        res = await fetch("/api/argus/screener", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universe: tickers,
            min_conviction: parseFloat(minScore),
          }),
        });
      }
      const data = (await res.json()) as ApiResponse;
      if (isErrorResponse(data)) {
        setError(data.error);
        setResults(null);
      } else {
        setResults(data.results);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  function handleRun() {
    const tickers = tickerInput
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    void runScreener(tickers.length > 0 ? tickers : null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleRun();
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Screener</h1>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="AAPL, TSLA, NVDA…"
            className="bg-[#161b22] border border-[#30363d] rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-60"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            Min score
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              step="0.05"
              min="0"
              max="1"
              className="bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-sm text-white w-16 focus:outline-none focus:border-gray-500"
            />
          </label>
          <button
            onClick={handleRun}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            {loading ? "Running…" : "Run ›"}
          </button>
          <button
            onClick={() => {
              setTickerInput("");
              void runScreener(null);
            }}
            disabled={loading}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            {loading ? "Running…" : "Run default universe"}
          </button>
        </div>

        {/* States */}
        {loading && (
          <p className="text-xs font-mono text-gray-400">Running agents… (may take 10–30s)</p>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && results === null && (
          <p className="text-sm text-gray-500">Enter tickers or run the default universe</p>
        )}

        {!loading && !error && results !== null && (
          <>
            <p className="text-xs text-gray-500 font-mono">
              {results.length} signal{results.length !== 1 ? "s" : ""} found
            </p>
            {results.length === 0 ? (
              <p className="text-sm text-gray-500">No results above threshold.</p>
            ) : (
              <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
                <ResultsTable
                  results={results}
                  onDrill={(symbol) => router.push(`/action/${symbol}`)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
