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
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import GexChart from "@/components/GexChart";

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

/** OI/Vol cell with a background bar; put bars grow toward the strike from the
 * left, call bars from the right — a mirrored liquidity profile. */
function BarCell({
  value,
  max,
  side,
  tone,
}: {
  value: number | null | undefined;
  max: number;
  side: "put" | "call";
  tone: string;
}) {
  const w = value != null && max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <td className={`relative px-2 py-1 text-muted ${side === "put" ? "text-right" : "text-left"}`}>
      <div
        className={`absolute inset-y-[3px] ${side === "put" ? "right-0" : "left-0"} rounded-sm ${tone}`}
        style={{ width: `${w}%` }}
      />
      <span className="relative">{fmtNum(value)}</span>
    </td>
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

  const [showLive, setShowLive] = useState(false);
  const { ladder: liveLadder, error: liveError, consecutiveFailures } = useOptionsLivePoller(
    activeSymbol,
    "0DTE",
    showLive
  );

  const expiries = data?.expiries ?? [];
  const idx = Math.min(expiryIdx, Math.max(expiries.length - 1, 0));
  const active = expiries[idx];
  const rows = active?.rows ?? [];

  const zgIdx = nearestStrikeIndex(rows, data?.levels?.zero_gamma ?? null);
  const callWallIdx =
    data?.levels?.call_wall != null ? nearestStrikeIndex(rows, data.levels.call_wall) : -1;
  const putWallIdx =
    data?.levels?.put_wall != null ? nearestStrikeIndex(rows, data.levels.put_wall) : -1;
  const spotIdx = nearestStrikeIndex(rows, data?.spot ?? null);

  // Scale maxes for the visual profile bars (per active expiry).
  const maxOi = Math.max(1, ...rows.flatMap((r) => [r.put?.oi ?? 0, r.call?.oi ?? 0]));
  const maxVol = Math.max(1, ...rows.flatMap((r) => [r.put?.vol ?? 0, r.call?.vol ?? 0]));
  const maxGex = Math.max(1, ...rows.map((r) => Math.abs(r.gex ?? 0)));

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLive(!showLive)}
            className={`px-2 py-1 text-xs rounded ${
              showLive ? "tone-live" : "border border-line text-muted"
            }`}
          >
            {showLive ? "LIVE" : "live"}
          </button>
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

      {/* Live Ladder Section */}
      {showLive && (
        <>
          {liveError && (
            <div className="px-4 py-2 border-b border-line">
              <p className="text-[11px] text-neg">{liveError}</p>
            </div>
          )}

          {liveLadder && (
            <>
              {/* Provenance Badge + Metadata */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-elevated/30">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 text-xs rounded font-semibold ${
                      liveLadder.source === "LIVE"
                        ? "tone-live"
                        : liveLadder.source === "FROZEN"
                          ? "tone-frozen"
                          : "tone-eod"
                    }`}
                  >
                    {liveLadder.source}
                  </span>
                  <span className="text-[11px] text-muted">
                    {new Date(liveLadder.as_of).toLocaleTimeString()}
                  </span>
                  {liveLadder.stale_ms > 0 && (
                    <span className="text-[11px] text-warn">{liveLadder.stale_ms}ms stale</span>
                  )}
                </div>
                <span className="text-[11px] text-muted">
                  Fresh {(liveLadder.fresh_contract_ratio * 100).toFixed(0)}% · GEX {liveLadder.net_gex_band}
                </span>
              </div>

              {/* Levels Summary Strip */}
              <div className="grid grid-cols-6 gap-2 border-b border-line px-4 py-2 text-[11px]">
                <div>
                  <span className="text-muted">ATM</span>
                  <span className="ml-2 font-semibold">{liveLadder.atm_strike.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-muted">Max Pain</span>
                  <span className="ml-2 font-semibold">
                    {liveLadder.max_pain != null ? liveLadder.max_pain.toFixed(2) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Pin Risk</span>
                  <span className="ml-2 font-semibold">{liveLadder.pin_risk.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-muted">Zero Gamma</span>
                  <span className="ml-2 font-semibold">
                    {liveLadder.zero_gamma_strike != null ? liveLadder.zero_gamma_strike.toFixed(0) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted">MSI Call/Put</span>
                  <span className="ml-2 font-semibold">
                    {liveLadder.msi_call_strike != null ? liveLadder.msi_call_strike.toFixed(0) : "—"} /
                    {liveLadder.msi_put_strike != null ? " " + liveLadder.msi_put_strike.toFixed(0) : " —"}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Net GEX</span>
                  <span className="ml-2 font-semibold">{liveLadder.net_gex_band}</span>
                </div>
              </div>

              {/* 23-Column Live Ladder Table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-elevated">
                    <tr className="border-b border-line">
                      <th className="px-2 py-1 text-left font-semibold">Strike</th>
                      {/* Call Headers */}
                      <th className="px-1 py-1 text-center text-teal">C Bid</th>
                      <th className="px-1 py-1 text-center text-teal">Ask</th>
                      <th className="px-1 py-1 text-center text-teal">IV</th>
                      <th className="px-1 py-1 text-center text-teal">Δ</th>
                      <th className="px-1 py-1 text-center text-teal">Γ</th>
                      <th className="px-1 py-1 text-center text-teal">Θ</th>
                      <th className="px-1 py-1 text-center text-teal">ν</th>
                      <th className="px-1 py-1 text-center text-teal">ρ</th>
                      <th className="px-1 py-1 text-center text-teal">Vol</th>
                      <th className="px-1 py-1 text-center text-teal">OI</th>
                      <th className="px-1 py-1 text-center text-teal">GEX</th>
                      {/* Put Headers */}
                      <th className="px-1 py-1 text-center text-neg">P Bid</th>
                      <th className="px-1 py-1 text-center text-neg">Ask</th>
                      <th className="px-1 py-1 text-center text-neg">IV</th>
                      <th className="px-1 py-1 text-center text-neg">Δ</th>
                      <th className="px-1 py-1 text-center text-neg">Γ</th>
                      <th className="px-1 py-1 text-center text-neg">Θ</th>
                      <th className="px-1 py-1 text-center text-neg">ν</th>
                      <th className="px-1 py-1 text-center text-neg">ρ</th>
                      <th className="px-1 py-1 text-center text-neg">Vol</th>
                      <th className="px-1 py-1 text-center text-neg">OI</th>
                      <th className="px-1 py-1 text-center text-neg">GEX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveLadder.levels.map((level) => (
                      <tr
                        key={level.strike}
                        className={`border-b border-line/50 ${
                          level.strike === liveLadder.zero_gamma_strike ? "bg-teal/10" : ""
                        } ${level.strike === liveLadder.atm_strike ? "bg-warn/10" : ""}`}
                      >
                        <td className="px-2 py-1 font-bold">{level.strike.toFixed(0)}</td>
                        {/* Call Greeks */}
                        <td className="px-1 py-1 text-center">
                          {level.call.bid != null ? level.call.bid.toFixed(2) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.ask != null ? level.call.ask.toFixed(2) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.iv != null ? (level.call.iv * 100).toFixed(1) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.delta != null ? level.call.delta.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.gamma != null ? level.call.gamma.toFixed(5) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.theta != null ? level.call.theta.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.vega != null ? level.call.vega.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.rho != null ? level.call.rho.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.volume != null ? level.call.volume.toFixed(0) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call.oi != null ? level.call.oi.toFixed(0) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.call_gex_by_strike != null ? (level.call_gex_by_strike / 1000).toFixed(0) : "—"}
                        </td>
                        {/* Put Greeks */}
                        <td className="px-1 py-1 text-center">
                          {level.put.bid != null ? level.put.bid.toFixed(2) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.ask != null ? level.put.ask.toFixed(2) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.iv != null ? (level.put.iv * 100).toFixed(1) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.delta != null ? level.put.delta.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.gamma != null ? level.put.gamma.toFixed(5) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.theta != null ? level.put.theta.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.vega != null ? level.put.vega.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.rho != null ? level.put.rho.toFixed(3) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.volume != null ? level.put.volume.toFixed(0) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put.oi != null ? level.put.oi.toFixed(0) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {level.put_gex_by_strike != null ? (level.put_gex_by_strike / 1000).toFixed(0) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* GEX Profile Chart — implementation deferred to Task 12 */}
            </>
          )}
        </>
      )}

      {!showLive && (
        <>
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
            <Lvl label="zero-γ" value={fmtLvl(data.levels?.zero_gamma)} />
            <Lvl label="call wall" value={fmtLvl(data.levels?.call_wall)} />
            <Lvl label="put wall" value={fmtLvl(data.levels?.put_wall)} />
            <Lvl label="net GEX" value={fmtGex(data.levels?.total_gex ?? null)} />
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
                        <BarCell value={row.put?.oi} max={maxOi} side="put" tone="bg-neg/20" />
                        <BarCell value={row.put?.vol} max={maxVol} side="put" tone="bg-neg/10" />
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
                        <BarCell value={row.call?.vol} max={maxVol} side="call" tone="bg-pos/10" />
                        <BarCell value={row.call?.oi} max={maxOi} side="call" tone="bg-pos/20" />
                        <td className="relative px-2 py-1 text-left">
                          <div
                            className={`absolute inset-y-[3px] rounded-sm ${
                              row.gex >= 0 ? "bg-pos/30" : "bg-neg/30"
                            }`}
                            style={{
                              left:
                                row.gex >= 0
                                  ? "50%"
                                  : `${50 - Math.min(50, (Math.abs(row.gex) / maxGex) * 50)}%`,
                              width: `${Math.min(50, (Math.abs(row.gex) / maxGex) * 50)}%`,
                            }}
                          />
                          <span className={`relative ${row.gex >= 0 ? "text-pos" : "text-neg"}`}>
                            {fmtGex(row.gex)}
                          </span>
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

            <div className="mt-3">
              <GexChart
                data={rows.map((r) => ({ strike: r.strike, gex: r.gex }))}
                spotStrike={data.spot}
                zeroGammaStrike={data.levels?.zero_gamma ?? null}
              />
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
        </>
      )}
    </main>
  );
}
