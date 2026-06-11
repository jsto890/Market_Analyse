"use client";

import Link from "next/link";
import useSWR from "swr";
import type { OptionsFlowData } from "@/types/argus";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

interface UnusualRow {
  strike?: unknown;
  expiry?: unknown;
  vol?: unknown;
  oi?: unknown;
  type?: unknown;
  [key: string]: unknown;
}

function isUnusualRow(v: unknown): v is UnusualRow {
  return typeof v === "object" && v !== null;
}

function UnusualTable({
  rows,
  label,
}: {
  rows: unknown[];
  label: string;
}) {
  const valid = rows.filter(isUnusualRow);
  if (valid.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse font-mono">
          <thead>
            <tr className="text-left text-gray-500 border-b border-[#30363d]">
              <th className="pb-1.5 pr-4 font-medium">Strike</th>
              <th className="pb-1.5 pr-4 font-medium">Expiry</th>
              <th className="pb-1.5 pr-4 font-medium text-right">Vol</th>
              <th className="pb-1.5 pr-4 font-medium text-right">OI</th>
              <th className="pb-1.5 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {valid.map((row, i) => (
              <tr
                key={i}
                className={i % 2 === 0 ? "" : "bg-white/[0.02]"}
              >
                <td className="py-1 pr-4 text-white">{String(row.strike ?? "—")}</td>
                <td className="py-1 pr-4 text-gray-300">{String(row.expiry ?? "—")}</td>
                <td className="py-1 pr-4 text-right text-gray-300">
                  {typeof row.vol === "number" ? row.vol.toLocaleString() : String(row.vol ?? "—")}
                </td>
                <td className="py-1 pr-4 text-right text-gray-300">
                  {typeof row.oi === "number" ? row.oi.toLocaleString() : String(row.oi ?? "—")}
                </td>
                <td className="py-1 text-gray-400">{String(row.type ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ApiResponse = OptionsFlowData | { error: string };

function isErrorResponse(r: ApiResponse): r is { error: string } {
  return "error" in r && !("symbol" in r);
}

export default function OptionsPage({
  params,
}: {
  params: { ticker: string };
}) {
  const { ticker } = params;
  const upper = ticker.toUpperCase();

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/argus/flow/${upper}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const offline =
    error != null ||
    (data != null && isErrorResponse(data));

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            ← Back
          </Link>
          <h1 className="text-base font-semibold text-white">
            {upper} Options Flow
          </h1>
        </div>

        {/* Loading */}
        {isLoading && (
          <p className="text-xs font-mono text-gray-500">Loading…</p>
        )}

        {/* Offline / error */}
        {!isLoading && offline && (
          <div className="bg-[#161b22] border border-[#30363d] rounded p-6 text-center space-y-3">
            <p className="text-sm text-gray-300 font-semibold">
              Options data unavailable — IBKR Gateway may be offline.
            </p>
            <p className="text-xs text-gray-500">
              Connect IBKR Gateway on port 4002 and try again.
            </p>
            <button
              onClick={() => void mutate()}
              className="text-xs bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 px-4 py-1.5 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Data */}
        {!isLoading && !offline && data && !isErrorResponse(data) && (
          <>
            {/* Spot / Expiry / Max Pain */}
            <div className="flex flex-wrap gap-4 text-sm font-mono">
              <div>
                <span className="text-gray-500">Spot </span>
                <span className="text-white font-semibold">
                  ${data.spot.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Expiry </span>
                <span className="text-white">{data.expiration}</span>
              </div>
              <div>
                <span className="text-gray-500">Max Pain </span>
                <span className="text-white">${data.max_pain.toFixed(2)}</span>
              </div>
            </div>

            {/* Flags */}
            {data.flags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.flags.map((flag) => (
                  <span
                    key={flag}
                    className="bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs font-mono px-2 py-0.5 rounded"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            )}

            {/* Summary table */}
            <div className="bg-[#161b22] border border-[#30363d] rounded p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Summary
              </p>
              <table className="w-full text-sm font-mono border-collapse">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-[#30363d]">
                    <th className="pb-1.5 font-medium w-40"></th>
                    <th className="pb-1.5 pr-6 font-medium text-right text-green-400">
                      Calls
                    </th>
                    <th className="pb-1.5 font-medium text-right text-red-400">
                      Puts
                    </th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-1 text-gray-500">OI</td>
                    <td className="py-1 pr-6 text-right tabular-nums">
                      {fmt(data.summary.call_oi)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {fmt(data.summary.put_oi)}
                    </td>
                  </tr>
                  <tr className="bg-white/[0.02]">
                    <td className="py-1 text-gray-500">Volume</td>
                    <td className="py-1 pr-6 text-right tabular-nums">
                      {fmt(data.summary.call_vol)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {fmt(data.summary.put_vol)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-500">P/C Ratio OI</td>
                    <td className="py-1 pr-6 text-right text-gray-600">—</td>
                    <td className="py-1 text-right tabular-nums">
                      {data.summary.pcr_oi.toFixed(3)}
                    </td>
                  </tr>
                  <tr className="bg-white/[0.02]">
                    <td className="py-1 text-gray-500">P/C Ratio Vol</td>
                    <td className="py-1 pr-6 text-right text-gray-600">—</td>
                    <td className="py-1 text-right tabular-nums">
                      {data.summary.pcr_vol.toFixed(3)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* IV */}
            <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-wrap gap-6 text-sm font-mono">
              <div>
                <span className="text-gray-500">IV ATM Call </span>
                <span className="text-green-400">{fmtPct(data.iv_atm_call)}</span>
              </div>
              <div>
                <span className="text-gray-500">Put </span>
                <span className="text-red-400">{fmtPct(data.iv_atm_put)}</span>
              </div>
              <div>
                <span className="text-gray-500">Skew </span>
                <span
                  className={
                    data.iv_skew > 0 ? "text-green-400" : data.iv_skew < 0 ? "text-red-400" : "text-gray-300"
                  }
                >
                  {data.iv_skew >= 0 ? "+" : ""}
                  {data.iv_skew.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Unusual activity */}
            {(data.unusual_calls_top.length > 0 || data.unusual_puts_top.length > 0) && (
              <div className="bg-[#161b22] border border-[#30363d] rounded p-4 space-y-5">
                <UnusualTable rows={data.unusual_calls_top} label="Unusual Calls" />
                <UnusualTable rows={data.unusual_puts_top} label="Unusual Puts" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
