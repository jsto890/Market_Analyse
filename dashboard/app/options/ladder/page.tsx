"use client";

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { nearestStrikeIndex, useLadder, useOdteSymbol } from "@/lib/odte";
import { fmtGex } from "@/lib/odteCompanion";
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import { isStale, type StrikeLevel } from "@/lib/optionsLive";
import { DENSITY_OPTIONS, densityPct, withinBand, type DensityKey } from "@/lib/optionsAnalytics";
import { useOptionsUi } from "@/lib/optionsUi";
import GexChart from "@/components/GexChart";
import MvcCard from "@/components/odte/MvcCard";
import InfoTip from "@/components/ui/InfoTip";
import Collapsible from "@/components/ui/Collapsible";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import { GREEK_LABEL } from "@/lib/labels";
import { price, greek } from "@/lib/format";
import type { GreekKind } from "@/lib/format";

const ALL_GREEKS: GreekKind[] = ["delta", "gamma", "theta", "vega", "rho"];
const DEFAULT_GREEKS: GreekKind[] = ["delta", "gamma", "theta"];

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

/** Strike markers, spelled out rather than left as bare initials. */
function Marker({ text, title, tone }: { text: string; title: string; tone: string }) {
  return (
    <span className={`ml-1 align-middle text-[11px] ${tone}`} title={title}>
      {text}
    </span>
  );
}

function LiveLadderRow({
  level,
  zeroGammaStrike,
  atmStrike,
  callWallStrike,
  putWallStrike,
  msiCallStrike,
  msiPutStrike,
  greekCols,
  rowRef,
  flash,
}: {
  level: StrikeLevel;
  zeroGammaStrike: number | null;
  atmStrike: number | null;
  callWallStrike: number | null;
  putWallStrike: number | null;
  msiCallStrike: number | null;
  msiPutStrike: number | null;
  greekCols: GreekKind[];
  rowRef?: (el: HTMLTableRowElement | null) => void;
  flash?: boolean;
}) {
  const isZg = level.strike === zeroGammaStrike;
  const isAtm = level.strike === atmStrike;
  const isCallWall = level.strike === callWallStrike;
  const isPutWall = level.strike === putWallStrike;
  const isMsiCall = level.strike === msiCallStrike;
  const isMsiPut = level.strike === msiPutStrike;
  const leftBorder = isAtm ? "border-l-2 border-l-warn" : isZg ? "border-l-2 border-l-teal" : "";

  const side = (kind: "call" | "put") => {
    const q = level[kind];
    const gex = kind === "call" ? level.call_gex_by_strike : level.put_gex_by_strike;
    const edge = kind === "put" ? "border-l border-line" : "";
    return (
      <>
        <td className={`px-1 py-1 text-right ${edge}`}>{q.bid != null ? price(q.bid) : "—"}</td>
        <td className="px-1 py-1 text-right">{q.ask != null ? price(q.ask) : "—"}</td>
        <td className="px-1 py-1 text-right">{q.iv != null ? (q.iv * 100).toFixed(1) : "—"}</td>
        {greekCols.map((g) => (
          <td key={g} className="px-1 py-1 text-right">
            {q[g] != null ? greek(q[g], g) : "—"}
          </td>
        ))}
        <td className="px-1 py-1 text-right">
          {q.spread_pct != null ? q.spread_pct.toFixed(1) : "—"}
        </td>
        <td className="px-1 py-1 text-center">
          <span className={q.liquid ? "text-teal" : "text-muted"} title={q.liquid ? "liquid" : "wide or one-sided"}>
            {q.liquid ? "●" : "○"}
          </span>
        </td>
        <td className="px-1 py-1 text-right">{q.volume != null ? q.volume.toFixed(0) : "—"}</td>
        <td className="px-1 py-1 text-right">{q.oi != null ? q.oi.toFixed(0) : "—"}</td>
        <td className={`px-1 py-1 text-right ${(gex ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
          {gex != null ? fmtGex(gex) : "—"}
        </td>
      </>
    );
  };

  return (
    <tr ref={rowRef} className={`border-b border-line/50 ${flash ? "bg-teal/10" : ""} ${leftBorder}`}>
      <td className="sticky left-0 z-10 bg-elevated px-2 py-1 font-bold">
        {level.strike.toFixed(0)}
        {isAtm && <Marker text="ATM" title="At the money — strike nearest spot" tone="text-warn" />}
        {isZg && <Marker text="ZG" title="Zero gamma — the dealer hedging flip" tone="text-teal" />}
        {isCallWall && <Marker text="CW" title="Call wall — heaviest dealer gamma above spot" tone="text-pos" />}
        {isPutWall && <Marker text="PW" title="Put wall — heaviest dealer gamma below spot" tone="text-neg" />}
        {isMsiCall && <Marker text="MSI-C" title="Max strike interest, calls — heaviest crowd concentration" tone="text-pos" />}
        {isMsiPut && <Marker text="MSI-P" title="Max strike interest, puts — heaviest crowd concentration" tone="text-neg" />}
      </td>
      {side("call")}
      {side("put")}
    </tr>
  );
}

function Lvl({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value}</span>
      {tip && <InfoTip label={`What ${label} means`} content={tip} />}
    </span>
  );
}

/** A named cluster in the levels strip — the row used to be one flat run of
 * eight unrelated numbers (OPT-12, OPT-13). */
function LevelGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-l border-line pl-3 first:border-l-0 first:pl-0">
      <span className="eyebrow shrink-0">{title}</span>
      {children}
    </div>
  );
}

export default function OptionsLadderPage() {
  const [activeSymbol] = useOdteSymbol();
  const { live: showLive, density, setDensity, expiry, setExpiry } = useOptionsUi();
  const [greekCols, setGreekCols] = useLocalStorage<GreekKind[]>(
    STATIC_KEYS.odteGreekCols,
    DEFAULT_GREEKS
  );
  const [descending, setDescending] = useState(true);
  const [jump, setJump] = useState("");
  const [flashStrike, setFlashStrike] = useState<number | null>(null);

  const band = densityPct(density);
  const { data, error, isLoading } = useLadder(activeSymbol, 4, band ?? 0.5);

  const [copiedStrike, setCopiedStrike] = useState<number | null>(null);
  function copyStrike(row: { strike: number; call: { iv: number | null } | null; put: { iv: number | null } | null; gex: number }) {
    const text = `${row.strike} · call IV ${fmtIv(row.call?.iv)} / put IV ${fmtIv(row.put?.iv)} · GEX ${fmtGex(row.gex)}`;
    navigator.clipboard?.writeText(text);
    setCopiedStrike(row.strike);
    window.setTimeout(() => setCopiedStrike((s) => (s === row.strike ? null : s)), 1500);
  }

  const {
    ladder: liveLadder,
    error: liveError,
    consecutiveFailures,
    status: liveStatus,
  } = useOptionsLivePoller(activeSymbol, expiry || "0DTE", showLive);

  const expiries = data?.expiries ?? [];
  const idx = Math.max(0, expiries.findIndex((e) => e.expiry === expiry));
  const active = expiries[idx];

  // Density and sort apply to whichever ladder is on screen (OPT-01, OPT-02).
  const rows = useMemo(() => {
    const banded = withinBand(active?.rows ?? [], data?.spot ?? null, band);
    return descending ? [...banded].sort((a, b) => b.strike - a.strike) : [...banded].sort((a, b) => a.strike - b.strike);
  }, [active, data?.spot, band, descending]);

  const liveLevels = useMemo(() => {
    const banded = withinBand(liveLadder?.levels ?? [], liveLadder?.spot ?? null, band);
    return descending ? [...banded].sort((a, b) => b.strike - a.strike) : [...banded].sort((a, b) => a.strike - b.strike);
  }, [liveLadder, band, descending]);

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
  const rowRefs = useRef(new Map<number, HTMLElement>());
  const centerOnSpot = () => spotRowRef.current?.scrollIntoView({ block: "center" });
  useEffect(() => {
    // Only re-center on a symbol or expiry change (OD-06) — re-running this on
    // every `data.spot` tick repeatedly yanked the user's scroll position.
    centerOnSpot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, idx, rows.length]);

  /** Jump to the nearest listed strike and flash it, so the target is findable
   * in a ladder that can run hundreds of rows (OPT-05). */
  function jumpToStrike() {
    const target = Number(jump);
    if (!Number.isFinite(target)) return;
    const strikes = showLive ? liveLevels.map((l) => l.strike) : rows.map((r) => r.strike);
    if (strikes.length === 0) return;
    const nearest = strikes.reduce((best, s) =>
      Math.abs(s - target) < Math.abs(best - target) ? s : best
    );
    rowRefs.current.get(nearest)?.scrollIntoView({ block: "center" });
    setFlashStrike(nearest);
    window.setTimeout(() => setFlashStrike((s) => (s === nearest ? null : s)), 1600);
  }

  function toggleGreek(g: GreekKind) {
    setGreekCols(
      greekCols.includes(g) ? greekCols.filter((x) => x !== g) : [...ALL_GREEKS.filter((x) => greekCols.includes(x) || x === g)]
    );
  }

  const perSideCols = 8 + greekCols.length;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {showLive
          ? "Live ladder on — streaming quotes and greeks."
          : "Live ladder off — daily snapshot ladder."}
      </p>

      {isLoading && !data && <p className="p-4 font-mono text-[11px] text-muted">loading ladder…</p>}
      {error && !data && (
        <p className="p-4 font-mono text-[11px] text-muted">no data — source unavailable</p>
      )}

      {/* Controls — expiry, density, sort, jump. Shared by both ladders (I4);
         must stay reachable in live mode since expiry drives the poller too. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="eyebrow shrink-0">Expiry</span>
          {expiries.map((e, i) => (
            <button
              key={e.expiry}
              onClick={() => setExpiry(e.expiry)}
              aria-pressed={i === idx}
              className={`whitespace-nowrap rounded px-2 py-1 text-[11px] ${
                i === idx ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {e.expiry} · EM {e.expected_move_pct.toFixed(2)}%
            </button>
          ))}
          {expiries.length === 0 && <span className="px-2 text-[11px] text-muted">—</span>}
        </div>

        {/* Density (OPT-01) — the ladder used to be pinned at ±6% with no say. */}
        <div className="flex items-center gap-1">
          <span className="eyebrow shrink-0">Density</span>
          {DENSITY_OPTIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDensity(d.key as DensityKey)}
              aria-pressed={density === d.key}
              title={d.blurb}
              className={`rounded px-2 py-1 text-[11px] ${
                density === d.key ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="eyebrow shrink-0">Sort</span>
          <button
            onClick={() => setDescending(!descending)}
            className="rounded px-2 py-1 text-[11px] text-muted hover:text-foreground"
          >
            strike {descending ? "high → low" : "low → high"}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <label htmlFor="jump-strike" className="eyebrow shrink-0">
            Jump
          </label>
          <input
            id="jump-strike"
            value={jump}
            inputMode="decimal"
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") jumpToStrike();
            }}
            placeholder="strike"
            className="w-20 rounded border border-line bg-raised px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-2"
          />
          <button
            onClick={jumpToStrike}
            className="rounded px-2 py-1 text-[11px] text-teal hover:underline"
          >
            Go
          </button>
        </div>

        <button
          type="button"
          onClick={centerOnSpot}
          className="ml-auto shrink-0 px-2 py-1 text-[11px] text-teal hover:underline"
        >
          Center on spot
        </button>
      </div>

      {showLive && (
        <>
          {/* Greek columns (OPT-05) — vega and rho were unreachable before. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-1.5">
            <span className="eyebrow shrink-0">Greeks</span>
            {ALL_GREEKS.map((g) => (
              <label key={g} className="flex items-center gap-1 font-mono text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={greekCols.includes(g)}
                  onChange={() => toggleGreek(g)}
                  className="accent-[var(--teal)]"
                />
                <span title={GREEK_LABEL[g].gloss}>
                  {GREEK_LABEL[g].symbol} {g}
                </span>
              </label>
            ))}
          </div>

          {liveStatus === "connecting" && (
            <div className="px-4 py-6 text-center text-[11px] text-muted">
              Connecting to live session…
            </div>
          )}
          {liveError && (
            <div className="border-b border-line px-4 py-2">
              <p className="text-[11px] text-neg">{liveError}</p>
            </div>
          )}

          {liveLadder && (
            <>
              <div className="flex items-center justify-between border-b border-line bg-elevated/30 px-4 py-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
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
                <span className="font-mono text-[11px] text-muted">
                  {liveLevels.length} of {liveLadder.levels.length} strikes shown
                </span>
              </div>

              {/* Levels — grouped by what each number answers (OPT-12, OPT-13). */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2 text-[11px]">
                <LevelGroup title="Pin">
                  <Lvl label="ATM" value={liveLadder.atm_strike.toFixed(0)} />
                  <Lvl
                    label="max pain"
                    value={liveLadder.max_pain != null ? liveLadder.max_pain.toFixed(2) : "—"}
                    tip="The strike where the most option value expires worthless — a gravity story, not a forecast."
                  />
                  <Lvl
                    label="pin risk"
                    value={`${liveLadder.pin_risk.toFixed(0)}/100`}
                    tip="How strongly the ladder implies price sticks to a strike into expiry. Above ~70, treat breakouts sceptically."
                  />
                </LevelGroup>
                <LevelGroup title="Dealer gamma">
                  <Lvl
                    label="zero-γ"
                    value={
                      liveLadder.zero_gamma_strike != null
                        ? liveLadder.zero_gamma_strike.toFixed(0)
                        : "—"
                    }
                    tip="Below it dealers are short gamma and hedging extends moves; above it they are long gamma and moves dampen."
                  />
                  <Lvl
                    label="net GEX"
                    value={liveLadder.net_gex_band}
                    tip="Total dealer gamma as a band rather than a raw number, because the raw number only means something against this underlying's own history."
                  />
                </LevelGroup>
                <LevelGroup title="Crowd">
                  <Lvl
                    label="MSI call/put"
                    value={`${
                      liveLadder.msi_call_strike != null ? liveLadder.msi_call_strike.toFixed(0) : "—"
                    } / ${
                      liveLadder.msi_put_strike != null ? liveLadder.msi_put_strike.toFixed(0) : "—"
                    }`}
                    tip={
                      liveLadder.msi_rationale ||
                      "Max strike interest — the strikes with the heaviest combined call/put concentration. Where the crowd sits, which is not where dealers must hedge."
                    }
                  />
                </LevelGroup>
                <LevelGroup title="Data">
                  <Lvl
                    label="fresh"
                    value={`${(liveLadder.fresh_contract_ratio * 100).toFixed(0)}%`}
                    tip="Share of contracts with a non-null quote as of the last poll — the basis for trusting everything above. Below ~70% the ladder is thin; treat it as directional, not precise."
                  />
                </LevelGroup>
              </div>

              <p role="status" aria-live="polite" className="sr-only">
                {liveLadder.symbol} live ladder updated, source{" "}
                {isStale(consecutiveFailures) ? "STALE" : liveLadder.source}.
              </p>
              <div aria-live="off">
                <div className="flex-1 overflow-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]">
                  <table className="w-full border-collapse text-[11px] tabular-nums">
                    <thead className="sticky top-0 bg-elevated">
                      {/* Grouped header — the call and put blocks used to be told
                         apart by colour alone (OPT-10). */}
                      <tr className="border-b border-line text-[10px] uppercase tracking-[0.06em]">
                        <th className="sticky left-0 z-20 bg-elevated px-2 py-1 text-left font-normal text-muted">
                          &nbsp;
                        </th>
                        <th colSpan={perSideCols} className="border-b border-pos/40 px-1 py-1 text-center font-semibold text-pos">
                          Calls
                        </th>
                        <th colSpan={perSideCols} className="border-b border-neg/40 border-l border-line px-1 py-1 text-center font-semibold text-neg">
                          Puts
                        </th>
                      </tr>
                      <tr className="border-b border-line">
                        <th scope="col" className="sticky left-0 z-20 bg-elevated px-2 py-1 text-left font-semibold">
                          Strike
                        </th>
                        {(["call", "put"] as const).map((side) => (
                          <Fragment key={side}>
                            <th scope="col" className={`px-1 py-1 text-center ${side === "put" ? "border-l border-line" : ""}`}>
                              {side === "call" ? "C" : "P"} Bid
                            </th>
                            <th scope="col" className="px-1 py-1 text-center">
                              Ask
                            </th>
                            <th scope="col" className="px-1 py-1 text-center">
                              IV
                            </th>
                            {greekCols.map((g) => (
                              <th
                                key={g}
                                scope="col"
                                className="px-1 py-1 text-center"
                                title={GREEK_LABEL[g].gloss}
                              >
                                {GREEK_LABEL[g].symbol}
                              </th>
                            ))}
                            <th scope="col" className="px-1 py-1 text-center">
                              Spread%
                            </th>
                            <th scope="col" className="px-1 py-1 text-center">
                              Liq
                            </th>
                            <th scope="col" className="px-1 py-1 text-center">
                              Vol
                            </th>
                            <th scope="col" className="px-1 py-1 text-center">
                              OI
                            </th>
                            <th scope="col" className="px-1 py-1 text-center">
                              GEX
                            </th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liveLevels.map((level) => (
                        <LiveLadderRow
                          key={level.strike}
                          level={level}
                          zeroGammaStrike={liveLadder.zero_gamma_strike}
                          atmStrike={liveLadder.atm_strike}
                          callWallStrike={liveLadder.call_wall_strike}
                          putWallStrike={liveLadder.put_wall_strike}
                          msiCallStrike={liveLadder.msi_call_strike}
                          msiPutStrike={liveLadder.msi_put_strike}
                          greekCols={greekCols}
                          flash={flashStrike === level.strike}
                          rowRef={(el) => {
                            if (el) rowRefs.current.set(level.strike, el);
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 p-3 lg:grid-cols-2">
                <MvcCard levels={liveLevels} spot={liveLadder.spot} />
                <GexChart
                  data={liveLevels.map((l) => ({
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

      {!showLive && data && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2 text-[11px]">
            <LevelGroup title="Dealer gamma">
              <Lvl
                label="zero-γ"
                value={fmtLvl(data.levels?.zero_gamma)}
                tip="Below it dealers are short gamma and hedging extends moves; above it they are long gamma and moves dampen."
              />
              <Lvl label="call wall" value={fmtLvl(data.levels?.call_wall)} />
              <Lvl label="put wall" value={fmtLvl(data.levels?.put_wall)} />
              <Lvl label="net GEX" value={fmtGex(data.levels?.total_gex ?? null)} />
            </LevelGroup>
            <LevelGroup title="Session">
              <Lvl label="spot" value={data.spot != null ? data.spot.toFixed(2) : "—"} />
              <Lvl
                label="exp. move"
                value={
                  expiries[idx]?.expected_move_pct != null
                    ? `±${expiries[idx].expected_move_pct.toFixed(2)}%`
                    : "—"
                }
                tip="The move the options market is pricing for this expiry, from ATM implied volatility."
              />
              <Lvl label="strikes" value={String(rows.length)} />
            </LevelGroup>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-1.5 font-mono text-[11px] text-muted-2">
              Click any row to copy its strike, both IVs and GEX. Greeks and quote-level detail need
              the live ladder — the switch is in the header.
            </p>
            <div className="max-h-[70vh] overflow-x-auto overflow-y-auto rounded border border-line bg-surface">
              <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th colSpan={3} scope="colgroup" className="px-2 py-1 text-right font-semibold text-neg">
                      Puts
                    </th>
                    <th className="border-x border-line px-3 py-1 text-center font-normal">&nbsp;</th>
                    <th colSpan={4} scope="colgroup" className="px-2 py-1 text-left font-semibold text-pos">
                      Calls
                    </th>
                  </tr>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th scope="col" className="px-2 py-1.5 text-right font-normal">put OI</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-normal">put vol</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-normal">put IV</th>
                    <th scope="col" className="border-x border-line px-3 py-1.5 text-center font-normal">
                      strike
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-left font-normal">call IV</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-normal">call vol</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-normal">call OI</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-normal">GEX</th>
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
                        ref={(el) => {
                          if (isSpot) spotRowRef.current = el;
                          if (el) rowRefs.current.set(row.strike, el);
                        }}
                        onClick={() => copyStrike(row)}
                        tabIndex={0}
                        title="Click to copy this strike"
                        aria-label={`Copy strike ${row.strike}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            copyStrike(row);
                          }
                        }}
                        className={`group cursor-pointer border-t border-line/50 hover:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal ${
                          highlight ? "bg-elevated" : ""
                        } ${flashStrike === row.strike ? "bg-teal/10" : ""} ${leftBorder}`}
                      >
                        <BarCell value={row.put?.oi} max={maxOi} side="put" tone="bg-neg/20" />
                        <BarCell value={row.put?.vol} max={maxVol} side="put" tone="bg-neg/10" />
                        <td className="px-2 py-1 text-right text-muted">{fmtIv(row.put?.iv)}</td>
                        <td className="border-x border-line px-3 py-1 text-center text-foreground">
                          <span>{row.strike}</span>
                          {copiedStrike === row.strike ? (
                            <span className="ml-1 align-middle text-[11px] text-teal">Copied</span>
                          ) : (
                            <span className="ml-1 align-middle text-[11px] text-muted-2 opacity-0 transition-opacity group-hover:opacity-100">
                              copy
                            </span>
                          )}
                          {isSpot && <Marker text="SPOT" title="Current underlying price" tone="text-warn" />}
                          {isZg && <Marker text="ZG" title="Zero gamma — the dealer hedging flip" tone="text-teal" />}
                          {isCallWall && <Marker text="CW" title="Call wall — heaviest dealer gamma above spot" tone="text-pos" />}
                          {isPutWall && <Marker text="PW" title="Put wall — heaviest dealer gamma below spot" tone="text-neg" />}
                        </td>
                        <td className="px-2 py-1 text-left text-muted">{fmtIv(row.call?.iv)}</td>
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
                      <td colSpan={8} className="py-4 text-center text-muted">
                        no strikes in this density band — widen it above
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
          </div>
        </>
      )}

      {/* Reference last, not first — it belongs at the bottom (OPT-08). The full
         version lives on its own tab; this is the pocket copy. */}
      <div className="mx-4 mb-4 mt-2">
        <Collapsible
          persistKey="strikes-how-to-read"
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
                  <b className="font-mono text-warn">SPOT / ATM</b> — current price and the strike
                  nearest it; the ladder centres here on load.
                </li>
                <li>
                  <b className="font-mono text-teal">ZG</b> — zero-gamma flip. Below it hedging{" "}
                  <b className="text-foreground">extends</b> moves; above it moves{" "}
                  <b className="text-foreground">pin or dampen</b>.
                </li>
                <li>
                  <b className="font-mono text-pos">CW</b> /{" "}
                  <b className="font-mono text-neg">PW</b> — heaviest dealer gamma above / below
                  spot: resistance and support.
                </li>
                <li>
                  <b className="font-mono text-foreground">MSI-C / MSI-P</b> — heaviest crowd
                  concentration, which is not the same thing as dealer hedging pressure.
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                Columns
              </p>
              <ul className="space-y-1">
                <li>
                  <b className="text-foreground">OI / Vol</b> — open interest and today&apos;s volume
                  per strike; puts left of the strike, calls right.
                </li>
                <li>
                  <b className="text-foreground">IV</b> — implied volatility at that strike.
                </li>
                <li>
                  <b className="text-foreground">GEX</b> — dealer-signed gamma exposure. Green
                  dampens; red amplifies.
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
            <p className="sm:col-span-2">
              Start <b className="text-foreground">ATM</b> for delta, then let the walls frame the
              trade. Strikes beyond the expected move are low-probability lottery tickets.{" "}
              <Link href="/options/learn" className="text-teal hover:underline">
                Full reference →
              </Link>
            </p>
          </div>
        </Collapsible>
      </div>
    </>
  );
}
