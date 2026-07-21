"use client";

import { useState, useEffect, useRef } from "react";
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

function fmtLvl(v: number | null | undefined): string {
  return v != null ? v.toFixed(0) : "—";
}

function LegendItem({ code, cls, label }: { code: string; cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-mono font-semibold ${cls}`}>{code}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function Lvl({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
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
  const spotIdx = nearestStrikeIndex(rows, data?.spot ?? null);

  // Anchor the ladder on the spot row so the pin zone (spot/walls/zero-gamma)
  // is visible first instead of the lowest strike.
  const spotRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    spotRowRef.current?.scrollIntoView({ block: "center" });
  }, [activeSymbol, idx, spotIdx, data?.spot]);

  return (
    <main className="flex flex-col font-mono h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line">
        <div className="flex items-center gap-3">
          <Link href="/odte" className="text-teal hover:underline text-xs">
            ← Overview
          </Link>
          <h1 className="text-sm font-semibold">
            Strikes · {activeSymbol}
            {data?.spot != null && (
              <span className="ml-2 font-mono text-[12px] font-normal text-warn tabular-nums">
                spot {data.spot.toFixed(2)}
              </span>
            )}
          </h1>
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

          {/* Legend + critical levels */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line px-4 py-2 text-[11px]">
            <span className="eyebrow">Markers</span>
            <LegendItem code="SPOT" cls="text-warn" label="last price" />
            <LegendItem code="ZG" cls="text-teal" label="zero-gamma flip" />
            <LegendItem code="CW" cls="text-pos" label="call wall (resistance)" />
            <LegendItem code="PW" cls="text-neg" label="put wall (support)" />
            <span className="h-3 w-px bg-line" />
            <span className="eyebrow">Levels</span>
            <Lvl label="zero-γ" value={fmtLvl(data.levels.zero_gamma)} />
            <Lvl label="call wall" value={fmtLvl(data.levels.call_wall)} />
            <Lvl label="put wall" value={fmtLvl(data.levels.put_wall)} />
            <Lvl label="net GEX" value={fmtGex(data.levels.total_gex)} />
            <Lvl
              label="exp. move"
              value={
                expiries[idx]?.expected_move_pct != null
                  ? `±${expiries[idx].expected_move_pct.toFixed(2)}%`
                  : "—"
              }
            />
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
                    const isSpot = i === spotIdx;
                    const highlight = isZg || isCallWall || isPutWall || isSpot;
                    const leftBorder = isSpot
                      ? "border-l-2 border-l-warn"
                      : isZg
                        ? "border-l-2 border-l-teal"
                        : "";
                    return (
                      <tr
                        key={row.strike}
                        ref={isSpot ? spotRowRef : undefined}
                        className={`border-t border-line/50 ${
                          highlight ? "bg-elevated" : ""
                        } ${leftBorder}`}
                      >
                        <td className="text-right px-2 py-1 text-muted">{fmtNum(row.put?.oi)}</td>
                        <td className="text-right px-2 py-1 text-muted">{fmtNum(row.put?.vol)}</td>
                        <td className="text-right px-2 py-1 text-muted">{fmtIv(row.put?.iv)}</td>
                        <td className="text-center px-3 py-1 border-x border-line text-foreground">
                          <span>{row.strike}</span>
                          {isSpot && (
                            <span className="ml-1 text-[9px] text-warn align-middle">SPOT</span>
                          )}
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

            {/* Educational footer */}
            <section className="mt-4 rounded-md border border-line bg-elevated">
              <div className="px-4 py-2.5">
                <span className="tick text-[13px] font-semibold text-foreground">
                  How to read this ladder
                </span>
              </div>
              <div className="grid gap-x-8 gap-y-3 border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    Markers
                  </p>
                  <ul className="space-y-1">
                    <li>
                      <b className="font-mono text-warn">SPOT</b> — current underlying price; the
                      ladder auto-centers here on load.
                    </li>
                    <li>
                      <b className="font-mono text-teal">ZG</b> — zero-gamma flip. Below it dealers
                      are short gamma and hedging <b className="text-foreground">extends</b> moves;
                      above it they&apos;re long gamma and moves <b className="text-foreground">
                        pin / dampen
                      </b>
                      .
                    </li>
                    <li>
                      <b className="font-mono text-pos">CW</b> — call wall: heaviest dealer gamma
                      above spot; acts as resistance and an upside magnet.
                    </li>
                    <li>
                      <b className="font-mono text-neg">PW</b> — put wall: heaviest dealer gamma
                      below spot; acts as support.
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    Columns
                  </p>
                  <ul className="space-y-1">
                    <li>
                      <b className="text-foreground">OI / Vol</b> — open interest &amp; today&apos;s
                      volume per strike (puts on the left, calls on the right of the strike).
                    </li>
                    <li>
                      <b className="text-foreground">IV</b> — implied volatility at that strike.
                    </li>
                    <li>
                      <b className="text-foreground">GEX</b> — dealer-signed gamma exposure. Green
                      (positive) dampens; red (negative) amplifies.
                    </li>
                  </ul>
                </div>
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    Picking a strike
                  </p>
                  <p>
                    Start <b className="text-foreground">ATM</b> (nearest SPOT) for delta, then let
                    the walls frame the trade: buy toward the wall in your direction (
                    <b className="font-mono text-pos">CW</b> for calls,{" "}
                    <b className="font-mono text-neg">PW</b> for puts) as the magnet, and treat the
                    opposite wall as where the move likely stalls. Strikes beyond the expected move
                    are low-probability lottery tickets — cheap, but usually expire worthless.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
