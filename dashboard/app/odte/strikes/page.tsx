"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  nearestStrikeIndex,
  useLadder,
  useOdteSymbol,
} from "@/lib/odte";
import { fmtGex } from "@/lib/odteCompanion";
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import { isStale, type StrikeLevel } from "@/lib/optionsLive";
import GexChart from "@/components/GexChart";
import SymbolSwitcher from "@/components/odte/SymbolSwitcher";
import InfoTip from "@/components/ui/InfoTip";
import Collapsible from "@/components/ui/Collapsible";
import Toggle from "@/components/ui/Toggle";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import { GREEK_LABEL } from "@/lib/labels";
import { price, greek } from "@/lib/format";
import type { GreekKind } from "@/lib/format";

function fmtIv(iv: number | null | undefined): string {
  return iv != null ? `${(iv * 100).toFixed(1)}%` : "—";
}

function fmtNum(v: number | null | undefined): string {
  return v != null ? String(v) : "—";
}

function fmtLvl(v: number | null | undefined): string {
  return v != null ? v.toFixed(0) : "—";
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

function LiveLadderRow({
  level,
  zeroGammaStrike,
  atmStrike,
  callWallStrike,
  putWallStrike,
}: {
  level: StrikeLevel;
  zeroGammaStrike: number | null;
  atmStrike: number | null;
  callWallStrike: number | null;
  putWallStrike: number | null;
}) {
  const isZg = level.strike === zeroGammaStrike;
  const isAtm = level.strike === atmStrike;
  const isCallWall = level.strike === callWallStrike;
  const isPutWall = level.strike === putWallStrike;
  const leftBorder = isAtm
    ? "border-l-2 border-l-warn"
    : isZg
      ? "border-l-2 border-l-teal"
      : "";
  return (
    <tr className={`border-b border-line/50 ${leftBorder}`}>
      <td className="sticky left-0 z-10 bg-elevated px-2 py-1 font-bold">
        {level.strike.toFixed(0)}
        {isAtm && <span className="ml-1 text-[11px] text-warn align-middle">ATM</span>}
        {isZg && <span className="ml-1 text-[11px] text-teal align-middle">ZG</span>}
        {isCallWall && <span className="ml-1 text-[11px] text-pos align-middle">CW</span>}
        {isPutWall && <span className="ml-1 text-[11px] text-neg align-middle">PW</span>}
      </td>
      {/* Call Greeks */}
      <td className="px-1 py-1 text-right">{level.call.bid != null ? price(level.call.bid) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.call.ask != null ? price(level.call.ask) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.call.iv != null ? (level.call.iv * 100).toFixed(1) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.call.delta != null ? greek(level.call.delta, "delta") : "—"}</td>
      <td className="px-1 py-1 text-right">{level.call.gamma != null ? greek(level.call.gamma, "gamma") : "—"}</td>
      <td className="px-1 py-1 text-right">{level.call.theta != null ? greek(level.call.theta, "theta") : "—"}</td>
      <td className="px-1 py-1 text-right">
        {level.call.spread_pct != null ? level.call.spread_pct.toFixed(1) : "—"}
      </td>
      <td className="px-1 py-1 text-center">
        <span className={level.call.liquid ? "text-teal" : "text-muted"}>●</span>
      </td>
      <td className="px-1 py-1 text-right">{level.call.volume != null ? level.call.volume.toFixed(0) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.call.oi != null ? level.call.oi.toFixed(0) : "—"}</td>
      <td className="px-1 py-1 text-right">
        {level.call_gex_by_strike != null ? (level.call_gex_by_strike / 1000).toFixed(0) : "—"}
      </td>
      {/* Put Greeks */}
      <td className="px-1 py-1 text-right">{level.put.bid != null ? price(level.put.bid) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.put.ask != null ? price(level.put.ask) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.put.iv != null ? (level.put.iv * 100).toFixed(1) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.put.delta != null ? greek(level.put.delta, "delta") : "—"}</td>
      <td className="px-1 py-1 text-right">{level.put.gamma != null ? greek(level.put.gamma, "gamma") : "—"}</td>
      <td className="px-1 py-1 text-right">{level.put.theta != null ? greek(level.put.theta, "theta") : "—"}</td>
      <td className="px-1 py-1 text-right">
        {level.put.spread_pct != null ? level.put.spread_pct.toFixed(1) : "—"}
      </td>
      <td className="px-1 py-1 text-center">
        <span className={level.put.liquid ? "text-teal" : "text-muted"}>●</span>
      </td>
      <td className="px-1 py-1 text-right">{level.put.volume != null ? level.put.volume.toFixed(0) : "—"}</td>
      <td className="px-1 py-1 text-right">{level.put.oi != null ? level.put.oi.toFixed(0) : "—"}</td>
      <td className="px-1 py-1 text-right">
        {level.put_gex_by_strike != null ? (level.put_gex_by_strike / 1000).toFixed(0) : "—"}
      </td>
    </tr>
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
  const [expiry, setExpiry] = useLocalStorage(STATIC_KEYS.odteExpiry, "0DTE");
  const { data, error, isLoading } = useLadder(activeSymbol, 4, 0.06);

  const [copiedStrike, setCopiedStrike] = useState<number | null>(null);
  function copyStrike(row: (typeof rows)[number]) {
    const text = `${row.strike} · call IV ${fmtIv(row.call?.iv)} / put IV ${fmtIv(row.put?.iv)} · GEX ${fmtGex(row.gex)}`;
    navigator.clipboard?.writeText(text);
    setCopiedStrike(row.strike);
    window.setTimeout(() => setCopiedStrike((s) => (s === row.strike ? null : s)), 1500);
  }

  const [showLive, setShowLive] = useLocalStorage(STATIC_KEYS.odteLiveMode, false);
  const {
    ladder: liveLadder,
    error: liveError,
    consecutiveFailures,
    status: liveStatus,
  } = useOptionsLivePoller(
    activeSymbol,
    expiry || "0DTE",
    showLive
  );

  const expiries = data?.expiries ?? [];
  const idx = Math.max(0, expiries.findIndex((e) => e.expiry === expiry));
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
  const centerOnSpot = () => spotRowRef.current?.scrollIntoView({ block: "center" });
  useEffect(() => {
    // Only re-center on a symbol or expiry change (OD-06) — re-running this on
    // every `data.spot` tick repeatedly yanked the user's scroll position.
    centerOnSpot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, idx, rows.length]);

  return (
    <main className="flex flex-col h-full">
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
          <Toggle checked={showLive} onChange={setShowLive} label="Show live options ladder" />
        </div>
        <div className="overflow-x-auto">
          <SymbolSwitcher active={activeSymbol} onChange={switchSymbol} />
        </div>
      </div>

      {/* Expiry selector — shared by classic and live ladders (I4); must stay
         reachable in both modes since it drives useOptionsLivePoller too. */}
      {data && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-line overflow-x-auto">
          {expiries.map((e, i) => (
            <button
              key={e.expiry}
              onClick={() => setExpiry(e.expiry)}
              className={`px-2 py-1 text-[11px] rounded whitespace-nowrap ${
                i === idx ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {e.expiry} · EM {e.expected_move_pct.toFixed(2)}%
            </button>
          ))}
          {!showLive && (
            <button
              type="button"
              onClick={centerOnSpot}
              className="ml-auto shrink-0 px-2 py-1 text-[11px] text-teal hover:underline"
            >
              Center on spot
            </button>
          )}
        </div>
      )}

      {/* Live Ladder Section */}
      {showLive && (
        <>
          {liveStatus === "connecting" && (
            <div className="px-4 py-6 text-center text-[11px] text-muted">
              Connecting to live session…
            </div>
          )}
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
                      isStale(consecutiveFailures)
                        ? "tone-frozen"
                        : liveLadder.source === "LIVE"
                          ? "tone-live"
                          : liveLadder.source === "FROZEN"
                            ? "tone-frozen"
                            : "tone-eod"
                    }`}
                  >
                    {isStale(consecutiveFailures) ? "STALE" : liveLadder.source}
                  </span>
                  <span className="text-[11px] text-muted">
                    {new Date(liveLadder.as_of).toLocaleTimeString()}
                  </span>
                  {liveLadder.stale_ms > 1500 && (
                    <span className="text-[11px] text-warn">
                      {(liveLadder.stale_ms / 1000).toFixed(1)}s stale
                    </span>
                  )}
                </div>
              </div>

              {/* Levels Summary Strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line px-4 py-2 text-[11px]">
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
                  <span className="text-muted">Pin Risk (0–100)</span>
                  <span className="ml-2 font-semibold">{liveLadder.pin_risk.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-muted">Zero Gamma</span>
                  <span className="ml-2 font-semibold">
                    {liveLadder.zero_gamma_strike != null ? liveLadder.zero_gamma_strike.toFixed(0) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted">MSI Call/Put</span>
                  <InfoTip
                    content={
                      liveLadder.msi_rationale ??
                      "Max-strike-interest — the strike with the heaviest combined call/put concentration."
                    }
                  >
                    <span className="sr-only">Why these strikes?</span>
                  </InfoTip>
                  <span className="ml-1 font-semibold">
                    {liveLadder.msi_call_strike != null ? liveLadder.msi_call_strike.toFixed(0) : "—"} /
                    {liveLadder.msi_put_strike != null ? " " + liveLadder.msi_put_strike.toFixed(0) : " —"}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Net GEX</span>
                  <span className="ml-2 font-semibold">{liveLadder.net_gex_band}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted">Fresh</span>
                  <span className="ml-1 font-semibold">
                    {(liveLadder.fresh_contract_ratio * 100).toFixed(0)}%
                  </span>
                  <InfoTip content="Share of contracts in this ladder with a non-null bid/ask/greeks quote as of the last poll — the basis for trusting the numbers above. Below ~70% the ladder is thin; treat it as directional, not precise.">
                    <span className="sr-only">What does fresh mean?</span>
                  </InfoTip>
                </div>
              </div>

              {/* 23-Column Live Ladder Table */}
              <p role="status" aria-live="polite" className="sr-only">
                {liveLadder.symbol} live ladder updated, source{" "}
                {isStale(consecutiveFailures) ? "STALE" : liveLadder.source}.
              </p>
              <div aria-live="off">
                <div className="flex-1 overflow-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]">
                <table className="w-full text-[11px] tabular-nums border-collapse">
                  <thead className="sticky top-0 bg-elevated">
                    <tr className="border-b border-line">
                      <th className="sticky left-0 z-20 bg-elevated px-2 py-1 text-left font-semibold">Strike</th>
                      {/* Call Headers */}
                      <th className="px-1 py-1 text-center text-teal">C Bid</th>
                      <th className="px-1 py-1 text-center text-teal">Ask</th>
                      <th className="px-1 py-1 text-center text-teal">IV</th>
                      <th className="px-1 py-1 text-center text-teal">Δ</th>
                      <th className="px-1 py-1 text-center text-teal">Γ</th>
                      <th className="px-1 py-1 text-center text-teal">Θ</th>
                      <th className="px-1 py-1 text-center text-teal">Spread%</th>
                      <th className="px-1 py-1 text-center text-teal">Liq</th>
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
                      <th className="px-1 py-1 text-center text-neg">Spread%</th>
                      <th className="px-1 py-1 text-center text-neg">Liq</th>
                      <th className="px-1 py-1 text-center text-neg">Vol</th>
                      <th className="px-1 py-1 text-center text-neg">OI</th>
                      <th className="px-1 py-1 text-center text-neg">GEX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveLadder.levels.map((level) => (
                      <LiveLadderRow
                        key={level.strike}
                        level={level}
                        zeroGammaStrike={liveLadder.zero_gamma_strike}
                        atmStrike={liveLadder.atm_strike}
                        callWallStrike={liveLadder.call_wall_strike}
                        putWallStrike={liveLadder.put_wall_strike}
                      />
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              <div className="mt-3 px-3">
                <GexChart
                  data={liveLadder.levels.map((l) => ({
                    strike: l.strike,
                    gex: (l.call_gex_by_strike ?? 0) + (l.put_gex_by_strike ?? 0),
                  }))}
                  spotStrike={liveLadder.spot}
                  zeroGammaStrike={liveLadder.zero_gamma_strike}
                />
              </div>
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
          {/* Legend + critical levels */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line px-4 py-2 text-[11px]">
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

          {/* How to read this ladder — promoted above the fold (OD-07): kept
             verbatim, only its position and expand/collapse mechanics change. */}
          <div className="mx-4 mt-2">
            <Collapsible
              persistKey="strikes-how-to-read"
              defaultOpen
              trigger={
                <span className="tick text-[13px] font-semibold text-foreground">
                  How to read this ladder
                </span>
              }
              className="rounded-md border border-line bg-elevated"
              triggerClassName="px-4 py-2.5"
            >
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
                    <li>
                      {(["delta", "gamma", "theta", "vega", "rho"] as GreekKind[]).map((k, i, arr) => (
                        <span key={k}>
                          <b className="font-mono text-foreground">{GREEK_LABEL[k].symbol}</b>{" "}
                          {GREEK_LABEL[k].gloss}
                          {i < arr.length - 1 ? " · " : " "}
                        </span>
                      ))}
                      <span className="text-muted">(live ladder only)</span>
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
            </Collapsible>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="bg-surface border border-line rounded overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full font-mono text-[11px] tabular-nums border-collapse">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-muted text-[11px] uppercase tracking-[0.06em]">
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
                        onClick={() => copyStrike(row)}
                        tabIndex={0}
                        aria-label={`Copy strike ${row.strike}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            copyStrike(row);
                          }
                        }}
                        className={`cursor-pointer border-t border-line/50 hover:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus-visible:-outline-offset-2 ${
                          highlight ? "bg-elevated" : ""
                        } ${leftBorder}`}
                      >
                        <BarCell value={row.put?.oi} max={maxOi} side="put" tone="bg-neg/20" />
                        <BarCell value={row.put?.vol} max={maxVol} side="put" tone="bg-neg/10" />
                        <td className="text-right px-2 py-1 text-muted">{fmtIv(row.put?.iv)}</td>
                        <td className="text-center px-3 py-1 border-x border-line text-foreground">
                          <span>{row.strike}</span>
                          {copiedStrike === row.strike && (
                            <span className="ml-1 text-[11px] text-teal align-middle">Copied</span>
                          )}
                          {isSpot && (
                            <span className="ml-1 text-[11px] text-warn align-middle">SPOT</span>
                          )}
                          {isZg && (
                            <span className="ml-1 text-[11px] text-teal align-middle">ZG</span>
                          )}
                          {isCallWall && (
                            <span className="ml-1 text-[11px] text-pos align-middle">CW</span>
                          )}
                          {isPutWall && (
                            <span className="ml-1 text-[11px] text-neg align-middle">PW</span>
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
          </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
