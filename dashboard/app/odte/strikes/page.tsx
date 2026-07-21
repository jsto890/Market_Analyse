"use client";

import { useState } from "react";
import Link from "next/link";
import {
  nearestStrikeIndex,
  odteEtfSymbols,
  odteIndexSymbols,
  useLadder,
  useOdteSymbol,
} from "@/lib/odte";
import { fmtGex } from "@/lib/odteCompanion";

function fmtIv(iv: number | null | undefined): string {
  return iv != null ? `${(iv * 100).toFixed(1)}%` : "—";
}

function fmtNum(v: number | null | undefined): string {
  return v != null ? String(v) : "—";
}

export default function OdteStrikesPage() {
  const [activeSymbol, switchSymbol] = useOdteSymbol();
  const [expiryIdx, setExpiryIdx] = useState(0);
  const { data, error, isLoading } = useLadder(activeSymbol, 4, 0.06);

  const expiries = data?.expiries ?? [];
  const idx = Math.min(expiryIdx, Math.max(expiries.length - 1, 0));
  const active = expiries[idx];
  const rows = active?.rows ?? [];

  const zgIdx = nearestStrikeIndex(rows, data?.levels.zero_gamma ?? null);
  const callWallIdx =
    data?.levels.call_wall != null ? nearestStrikeIndex(rows, data.levels.call_wall) : -1;
  const putWallIdx =
    data?.levels.put_wall != null ? nearestStrikeIndex(rows, data.levels.put_wall) : -1;

  return (
    <main className="flex flex-col font-mono h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line">
        <div className="flex items-center gap-3">
          <Link href="/odte" className="text-teal hover:underline text-xs">
            ← Overview
          </Link>
          <h1 className="text-sm font-semibold">Strikes · {activeSymbol}</h1>
        </div>
        <div className="overflow-x-auto">
          <div className="flex rounded border border-line overflow-hidden">
            <div className="flex items-center gap-2 px-2">
              <span className="text-xs text-muted">ETF</span>
              {odteEtfSymbols.map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => switchSymbol(symbol)}
                  className={`px-2 py-0.5 text-xs ${
                    symbol === activeSymbol ? "bg-green-500/20 text-green-400" : "text-muted"
                  }`}
                >
                  {symbol}
                </button>
              ))}
            </div>
            <span className="w-px h-4 bg-line mx-1" />
            <div className="flex items-center gap-2 px-2">
              <span className="text-xs text-muted">INDEX</span>
              {odteIndexSymbols.map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => switchSymbol(symbol)}
                  className={`px-2 py-0.5 text-xs ${
                    symbol === activeSymbol ? "bg-green-500/20 text-green-400" : "text-muted"
                  }`}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading && !data && (
        <p className="text-[11px] text-muted font-mono p-4">loading ladder…</p>
      )}
      {error && !data && (
        <p className="text-[11px] text-muted font-mono p-4">no data — source unavailable</p>
      )}

      {data && (
        <>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-line overflow-x-auto">
            {expiries.map((e, i) => (
              <button
                key={e.expiry}
                onClick={() => setExpiryIdx(i)}
                className={`px-2 py-1 text-[11px] rounded whitespace-nowrap ${
                  i === idx ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {e.expiry} · EM {e.expected_move_pct.toFixed(2)}%
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="bg-surface border border-line rounded overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full font-mono text-[11px] tabular-nums border-collapse">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-muted text-[10px] uppercase tracking-[0.06em]">
                    <th className="text-right px-2 py-1.5 font-normal">put OI</th>
                    <th className="text-right px-2 py-1.5 font-normal">put vol</th>
                    <th className="text-right px-2 py-1.5 font-normal">put IV</th>
                    <th className="text-center px-3 py-1.5 font-normal border-x border-line">
                      strike
                    </th>
                    <th className="text-left px-2 py-1.5 font-normal">call IV</th>
                    <th className="text-left px-2 py-1.5 font-normal">call vol</th>
                    <th className="text-left px-2 py-1.5 font-normal">call OI</th>
                    <th className="text-left px-2 py-1.5 font-normal">GEX</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isZg = i === zgIdx;
                    const isCallWall = i === callWallIdx;
                    const isPutWall = i === putWallIdx;
                    const highlight = isZg || isCallWall || isPutWall;
                    return (
                      <tr
                        key={row.strike}
                        className={`border-t border-line/50 ${
                          highlight ? "bg-elevated" : ""
                        } ${isZg ? "border-l-2 border-l-teal" : ""}`}
                      >
                        <td className="text-right px-2 py-1 text-muted">{fmtNum(row.put?.oi)}</td>
                        <td className="text-right px-2 py-1 text-muted">{fmtNum(row.put?.vol)}</td>
                        <td className="text-right px-2 py-1 text-muted">{fmtIv(row.put?.iv)}</td>
                        <td className="text-center px-3 py-1 border-x border-line text-foreground">
                          <span>{row.strike}</span>
                          {isZg && (
                            <span className="ml-1 text-[9px] text-teal align-middle">ZG</span>
                          )}
                          {isCallWall && (
                            <span className="ml-1 text-[9px] text-pos align-middle">CW</span>
                          )}
                          {isPutWall && (
                            <span className="ml-1 text-[9px] text-neg align-middle">PW</span>
                          )}
                        </td>
                        <td className="text-left px-2 py-1 text-muted">{fmtIv(row.call?.iv)}</td>
                        <td className="text-left px-2 py-1 text-muted">{fmtNum(row.call?.vol)}</td>
                        <td className="text-left px-2 py-1 text-muted">{fmtNum(row.call?.oi)}</td>
                        <td
                          className={`text-left px-2 py-1 ${
                            row.gex >= 0 ? "text-pos" : "text-neg"
                          }`}
                        >
                          {fmtGex(row.gex)}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        no data — source unavailable
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
