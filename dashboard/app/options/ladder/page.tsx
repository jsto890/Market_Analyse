"use client";

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { nearestStrikeIndex, useLadder, useOdteSymbol } from "@/lib/odte";
import { fmtGex } from "@/lib/odteCompanion";
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import { isStale, type StrikeLevel } from "@/lib/optionsLive";
import { DENSITY_OPTIONS, densityCount, withinStrikes, type DensityKey } from "@/lib/optionsAnalytics";
import { useOptionsUi } from "@/lib/optionsUi";
import GexChart from "@/components/GexChart";
import MvcCard from "@/components/odte/MvcCard";
import InfoTip from "@/components/ui/InfoTip";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Collapsible from "@/components/ui/Collapsible";
import Page from "@/components/ui/Page";
import Loading from "@/components/ui/Loading";
import Failed from "@/components/ui/Failed";
import Empty from "@/components/ui/Empty";
import Stale from "@/components/ui/Stale";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import { GREEK_LABEL } from "@/lib/labels";
import { price, greek } from "@/lib/format";
import type { GreekKind } from "@/lib/format";

const ALL_GREEKS: GreekKind[] = ["delta", "gamma", "theta", "vega", "rho"];
const DEFAULT_GREEKS: GreekKind[] = ["delta", "gamma", "theta"];

/** The live ladder used to render 23 columns at once. Grouping them lets the
 * default be the 13 a strike read actually needs, without deleting the rest. */
type GroupKey = "price" | "flow" | "gamma" | "greeks" | "quality";

const COLUMN_GROUPS: { key: GroupKey; label: string; blurb: string }[] = [
  { key: "price", label: "Price", blurb: "bid · ask · IV" },
  { key: "flow", label: "Flow", blurb: "volume · open interest" },
  { key: "gamma", label: "Gamma", blurb: "dealer gamma at the strike" },
  { key: "greeks", label: "Greeks", blurb: "per-contract sensitivities" },
  { key: "quality", label: "Quality", blurb: "spread width · two-sided flag" },
];

const DEFAULT_GROUPS: GroupKey[] = ["price", "flow", "gamma"];

/** Second sticky header row. `top-[25px]` clears the group row above it —
 * a two-row sticky header has no way to measure the first row from CSS. */
const LIVE_HEAD =
  "sticky top-[25px] z-20 border-b border-line bg-surface px-1 py-1 text-center font-normal";

/** Centre a row inside its own scroll box and nowhere else. `scrollIntoView`
 * scrolls every scrollable ancestor, so centring on spot also dragged the outer
 * pane down — carrying the sticky column header off the top of the screen. */
function centerRow(row: HTMLElement | null | undefined): void {
  const box = row?.closest<HTMLElement>("[data-ladder-scroll]");
  if (!row || !box) return;
  const delta = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
  box.scrollTop += delta - (box.clientHeight - row.offsetHeight) / 2;
}

function fmtIv(iv: number | null | undefined): string {
  return iv != null ? `${(iv * 100).toFixed(1)}%` : "—";
}

function fmtNum(v: number | null | undefined): string {
  return v != null ? String(v) : "—";
}

function fmtLvl(v: number | null | undefined): string {
  return v != null ? v.toFixed(0) : "—";
}

/** OI/Vol cell with a background bar. `anchor` is the edge the bar grows from,
 * always the one nearest the strike column, so the two sides read as one
 * mirrored liquidity profile spreading outward from the centre. */
function BarCell({
  value,
  max,
  anchor,
  tone,
  className = "px-2 py-1",
}: {
  value: number | null | undefined;
  max: number;
  anchor: "left" | "right";
  tone: string;
  className?: string;
}) {
  const w = value != null && max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <td
      className={`relative text-muted ${anchor === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <div
        className={`absolute inset-y-[3px] ${anchor === "right" ? "right-0" : "left-0"} rounded-sm ${tone}`}
        style={{ width: `${w}%` }}
      />
      <span className="relative">{fmtNum(value)}</span>
    </td>
  );
}

/** Strike markers. Deliberately *not* tooltipped per row: the ladder renders
 * ~100 rows, so a `title` per marker meant the same six explanations were
 * repeated over a hundred times and were only reachable by hovering a 20px
 * glyph. MarkerLegend states each one once, above the table. */
function Marker({ text, tone }: { text: string; tone: string }) {
  return <span className={`ml-1 align-middle text-micro ${tone}`}>{text}</span>;
}

const MARKER_MEANING: Array<{ code: string; tone: string; meaning: string }> = [
  { code: "ATM", tone: "text-warn", meaning: "at the money — strike nearest spot" },
  { code: "SPOT", tone: "text-warn", meaning: "current underlying price" },
  { code: "ZG", tone: "text-teal", meaning: "zero gamma — the dealer hedging flip" },
  { code: "CW", tone: "text-call", meaning: "call wall — heaviest dealer gamma above spot" },
  { code: "PW", tone: "text-put", meaning: "put wall — heaviest dealer gamma below spot" },
  { code: "MSI-C", tone: "text-call", meaning: "max strike interest, calls" },
  { code: "MSI-P", tone: "text-put", meaning: "max strike interest, puts" },
];

function MarkerLegend({ codes }: { codes: string[] }) {
  const shown = MARKER_MEANING.filter((m) => codes.includes(m.code));
  return (
    <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 text-body text-muted">
      {shown.map((m) => (
        <div key={m.code} className="flex items-baseline gap-1.5">
          <dt className={`font-mono ${m.tone}`}>{m.code}</dt>
          <dd>{m.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

interface LiveScale {
  oi: number;
  vol: number;
}

interface LiveCol {
  id: string;
  group: GroupKey;
  head: string;
  gloss?: string;
}

/** Columns in spec order **outward from the strike**: Bid · Ask · Vol · OI ·
 * IV · GEX, then the optional groups further out. Calls render this reversed,
 * so both sides read from the centre. */
function liveColumns(groups: GroupKey[], greekCols: GreekKind[]): LiveCol[] {
  const on = (g: GroupKey) => groups.includes(g);
  const cols: LiveCol[] = [];
  if (on("price")) cols.push({ id: "bid", group: "price", head: "bid" }, { id: "ask", group: "price", head: "ask" });
  if (on("flow")) cols.push({ id: "vol", group: "flow", head: "vol" }, { id: "oi", group: "flow", head: "OI" });
  if (on("price")) cols.push({ id: "iv", group: "price", head: "IV" });
  if (on("gamma")) cols.push({ id: "gex", group: "gamma", head: "GEX" });
  if (on("greeks")) {
    for (const g of greekCols) {
      cols.push({ id: g, group: "greeks", head: GREEK_LABEL[g].symbol, gloss: GREEK_LABEL[g].gloss });
    }
  }
  if (on("quality")) {
    cols.push(
      { id: "spread", group: "quality", head: "spr%", gloss: "Bid–ask width as a percent of the mid. Above ~15% the screen price is not a price you can trade." },
      { id: "liq", group: "quality", head: "liq", gloss: "● two-sided and inside the spread cap · ○ wide or one-sided — treat the mid as unreliable." }
    );
  }
  return cols;
}

function LiveCell({
  col,
  level,
  side,
  scale,
  anchor,
}: {
  col: LiveCol;
  level: StrikeLevel;
  side: "call" | "put";
  scale: LiveScale;
  anchor: "left" | "right";
}) {
  const q = level[side];
  const align = anchor === "right" ? "text-right" : "text-left";
  const gex = side === "call" ? level.call_gex_by_strike : level.put_gex_by_strike;
  const barTone = side === "call" ? "bg-call" : "bg-put";

  switch (col.id) {
    case "bid":
      return <td className={`px-1 py-1 ${align}`}>{q.bid != null ? price(q.bid) : "—"}</td>;
    case "ask":
      return <td className={`px-1 py-1 ${align}`}>{q.ask != null ? price(q.ask) : "—"}</td>;
    case "vol":
      return (
        <BarCell value={q.volume} max={scale.vol} anchor={anchor} tone={`${barTone}/10`} className="px-1 py-1" />
      );
    case "oi":
      return <BarCell value={q.oi} max={scale.oi} anchor={anchor} tone={`${barTone}/20`} className="px-1 py-1" />;
    case "iv":
      return <td className={`px-1 py-1 ${align}`}>{q.iv != null ? (q.iv * 100).toFixed(1) : "—"}</td>;
    case "gex":
      return (
        <td className={`px-1 py-1 ${align} ${(gex ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
          {gex != null ? fmtGex(gex) : "—"}
        </td>
      );
    case "spread":
      return (
        <td className={`px-1 py-1 ${align}`}>{q.spread_pct != null ? q.spread_pct.toFixed(1) : "—"}</td>
      );
    case "liq":
      return (
        <td className="px-1 py-1 text-center">
          {/* No per-cell title: 100 rows × 2 sides meant 200 copies of the same
           * two words. The column header carries the key once. */}
          <span className={q.liquid ? "text-teal" : "text-muted"}>
            <span className="sr-only">{q.liquid ? "liquid" : "wide or one-sided"}</span>
            <span aria-hidden>{q.liquid ? "●" : "○"}</span>
          </span>
        </td>
      );
    default: {
      const g = col.id as GreekKind;
      return <td className={`px-1 py-1 ${align}`}>{q[g] != null ? greek(q[g], g) : "—"}</td>;
    }
  }
}

function LiveLadderRow({
  level,
  zeroGammaStrike,
  atmStrike,
  callWallStrike,
  putWallStrike,
  msiCallStrike,
  msiPutStrike,
  cols,
  scale,
  rowRef,
  flash,
  copied,
  onCopy,
}: {
  level: StrikeLevel;
  zeroGammaStrike: number | null;
  atmStrike: number | null;
  callWallStrike: number | null;
  putWallStrike: number | null;
  msiCallStrike: number | null;
  msiPutStrike: number | null;
  cols: LiveCol[];
  scale: LiveScale;
  rowRef?: (el: HTMLTableRowElement | null) => void;
  flash?: boolean;
  copied?: boolean;
  onCopy: () => void;
}) {
  const isZg = level.strike === zeroGammaStrike;
  const isAtm = level.strike === atmStrike;
  const isCallWall = level.strike === callWallStrike;
  const isPutWall = level.strike === putWallStrike;
  const isMsiCall = level.strike === msiCallStrike;
  const isMsiPut = level.strike === msiPutStrike;
  // border-separate means <tr> borders and backgrounds no longer paint, so the
  // row rule, the accent edge and the flash all ride on the cells.
  const leftBorder = isAtm
    ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-warn"
    : isZg
      ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-teal"
      : "";

  return (
    <tr
      ref={rowRef}
      onClick={onCopy}
      tabIndex={0}
      aria-label={`Copy strike ${level.strike}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCopy();
        }
      }}
      className={`group cursor-pointer [&>td]:border-b [&>td]:border-line/50 hover:[&>td]:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal ${
        flash ? "[&>td]:bg-teal/10" : ""
      } ${leftBorder}`}
    >
      {[...cols].reverse().map((c) => (
        <LiveCell key={`c-${c.id}`} col={c} level={level} side="call" scale={scale} anchor="right" />
      ))}
      <td
        className={`sticky left-0 z-10 border-x-2 border-line-strong px-2 py-1 text-center font-bold ${
          flash ? "bg-teal/10" : "bg-elevated"
        }`}
      >
        <span>{level.strike.toFixed(0)}</span>
        {copied ? (
          <span className="ml-1 align-middle text-micro text-teal">Copied</span>
        ) : (
          <span className="ml-1 align-middle text-micro text-muted opacity-0 transition-opacity group-hover:opacity-100">
            copy
          </span>
        )}
        {isAtm && <Marker text="ATM" tone="text-warn" />}
        {isZg && <Marker text="ZG" tone="text-teal" />}
        {isCallWall && <Marker text="CW" tone="text-call" />}
        {isPutWall && <Marker text="PW" tone="text-put" />}
        {isMsiCall && <Marker text="MSI-C" tone="text-call" />}
        {isMsiPut && <Marker text="MSI-P" tone="text-put" />}
      </td>
      {cols.map((c) => (
        <LiveCell key={`p-${c.id}`} col={c} level={level} side="put" scale={scale} anchor="left" />
      ))}
    </tr>
  );
}

function Lvl({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-data">
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
  const [groups, setGroups] = useLocalStorage<GroupKey[]>(
    STATIC_KEYS.odteColumnGroups,
    DEFAULT_GROUPS
  );
  const [descending, setDescending] = useState(true);
  const [jump, setJump] = useState("");
  const [flashStrike, setFlashStrike] = useState<number | null>(null);

  const count = densityCount(density);
  // Fetch wide and slice on the client: the snapshot endpoint takes a percent
  // band, not a strike count, so a ±40-strike request has no server-side form.
  const { data, error, isLoading } = useLadder(activeSymbol, 4, 0.5);

  const [copiedStrike, setCopiedStrike] = useState<number | null>(null);
  function flagCopied(strike: number) {
    setCopiedStrike(strike);
    window.setTimeout(() => setCopiedStrike((s) => (s === strike ? null : s)), 1500);
  }

  function copyStrike(row: { strike: number; call: { iv: number | null } | null; put: { iv: number | null } | null; gex: number }) {
    const text = `${row.strike} · call IV ${fmtIv(row.call?.iv)} / put IV ${fmtIv(row.put?.iv)} · GEX ${fmtGex(row.gex)}`;
    navigator.clipboard?.writeText(text);
    flagCopied(row.strike);
  }

  /** Copy works in live mode too — it used to be snapshot-only, so the ladder
   * you actually trade off was the one you could not lift a strike out of. */
  function copyLiveStrike(level: StrikeLevel) {
    const gex = (level.call_gex_by_strike ?? 0) + (level.put_gex_by_strike ?? 0);
    const text = `${level.strike} · call ${price(level.call.bid)}/${price(level.call.ask)} IV ${fmtIv(
      level.call.iv
    )} · put ${price(level.put.bid)}/${price(level.put.ask)} IV ${fmtIv(level.put.iv)} · GEX ${fmtGex(gex)}`;
    navigator.clipboard?.writeText(text);
    flagCopied(level.strike);
  }

  function toggleGroup(g: GroupKey) {
    setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g]);
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
    const banded = withinStrikes(active?.rows ?? [], data?.spot ?? null, count);
    return descending ? [...banded].sort((a, b) => b.strike - a.strike) : [...banded].sort((a, b) => a.strike - b.strike);
  }, [active, data?.spot, count, descending]);

  const liveLevels = useMemo(() => {
    const banded = withinStrikes(liveLadder?.levels ?? [], liveLadder?.spot ?? null, count);
    return descending ? [...banded].sort((a, b) => b.strike - a.strike) : [...banded].sort((a, b) => a.strike - b.strike);
  }, [liveLadder, count, descending]);

  const liveCols = useMemo(() => liveColumns(groups, greekCols), [groups, greekCols]);
  // Bars scale against the visible window, not the whole chain: a ±10 view
  // otherwise renders every bar as a sliver of some far-wing open interest.
  const liveScale = useMemo<LiveScale>(
    () => ({
      oi: Math.max(1, ...liveLevels.flatMap((l) => [l.call.oi ?? 0, l.put.oi ?? 0])),
      vol: Math.max(1, ...liveLevels.flatMap((l) => [l.call.volume ?? 0, l.put.volume ?? 0])),
    }),
    [liveLevels]
  );

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
  const centerOnSpot = () => centerRow(spotRowRef.current);
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
    centerRow(rowRefs.current.get(nearest));
    setFlashStrike(nearest);
    window.setTimeout(() => setFlashStrike((s) => (s === nearest ? null : s)), 1600);
  }

  function toggleGreek(g: GreekKind) {
    setGreekCols(
      greekCols.includes(g) ? greekCols.filter((x) => x !== g) : [...ALL_GREEKS.filter((x) => greekCols.includes(x) || x === g)]
    );
  }

  return (
    <Page width="full" flush>
      <p role="status" aria-live="polite" className="sr-only">
        {showLive
          ? "Live ladder on — streaming quotes and greeks."
          : "Live ladder off — daily snapshot ladder."}
      </p>

      {isLoading && !data && (
        <Loading
          variant="rows"
          label="Loading ladder"
          headers={["strike", "put OI", "put vol", "put IV", "call IV", "call vol", "call OI", "GEX"]}
          count={10}
          className="mx-4"
        />
      )}
      {error && !data && (
        <Failed
          title="Ladder unavailable"
          message="The options snapshot did not load — the source is unreachable."
          className="mx-4"
        />
      )}

      {/* Controls — expiry, density, sort, jump. Shared by both ladders (I4);
         must stay reachable in live mode since expiry drives the poller too. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-[var(--page-x)] py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="eyebrow shrink-0">Expiry</span>
          {expiries.map((e, i) => (
            <button
              key={e.expiry}
              onClick={() => setExpiry(e.expiry)}
              aria-pressed={i === idx}
              className={`whitespace-nowrap rounded px-2 py-1 text-data ${
                i === idx ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {e.expiry} · EM {e.expected_move_pct.toFixed(2)}%
            </button>
          ))}
          {expiries.length === 0 && <span className="px-2 text-data text-muted">—</span>}
        </div>

        {/* Strikes (OPT-01) — the ladder used to be pinned at ±6% with no say,
           and a percent band means a different row count on every symbol. */}
        <SegmentedControl
          label="Strikes"
          value={density}
          options={DENSITY_OPTIONS}
          onChange={setDensity}
        />

        <div className="flex items-center gap-1">
          <span className="eyebrow shrink-0">Sort</span>
          <button
            onClick={() => setDescending(!descending)}
            className="rounded px-2 py-1 text-body text-muted hover:text-foreground"
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
            className="w-20 rounded border border-line bg-raised px-2 py-1 text-data text-foreground placeholder:text-muted"
          />
          <button
            onClick={jumpToStrike}
            className="rounded px-2 py-1 text-body text-teal hover:underline"
          >
            Go
          </button>
        </div>

        <button
          type="button"
          onClick={centerOnSpot}
          className="ml-auto shrink-0 px-2 py-1 text-body text-teal hover:underline"
        >
          Center on spot
        </button>
      </div>

      {showLive && (
        <>
          {/* Column groups (OPT-04) — the live ladder opened at 23 columns, so
             the numbers a strike read needs sat next to ones it does not.
             Off by default: greeks (per-contract sensitivities) and quality
             (spread width, two-sided flag). */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-[var(--page-x)] py-1.5">
            <span className="eyebrow shrink-0">Columns</span>
            {COLUMN_GROUPS.map((g) => (
              <label key={g.key} className="flex items-center gap-1 text-body text-muted">
                <input
                  type="checkbox"
                  checked={groups.includes(g.key)}
                  onChange={() => toggleGroup(g.key)}
                  className="accent-[var(--teal)]"
                />
                {g.label}
                <span className="text-2">{g.blurb}</span>
              </label>
            ))}
            <span className="ml-auto text-body text-2">
              {liveCols.length * 2 + 1} columns
            </span>
          </div>

          {/* Greek columns (OPT-05) — vega and rho were unreachable before. */}
          <div
            className={`flex flex-wrap items-center gap-2 border-b border-line px-[var(--page-x)] py-1.5 ${
              groups.includes("greeks") ? "" : "hidden"
            }`}
          >
            <span className="eyebrow shrink-0">Greeks</span>
            {ALL_GREEKS.map((g) => (
              <span key={g} className="flex items-center gap-1">
                <label className="flex items-center gap-1 text-body text-muted">
                  <input
                    type="checkbox"
                    checked={greekCols.includes(g)}
                    onChange={() => toggleGreek(g)}
                    className="accent-[var(--teal)]"
                  />
                  {GREEK_LABEL[g].symbol} {g}
                </label>
                {/* InfoTip sits outside the <label>: a button inside a label
                 * swallows the click that toggles the checkbox, and a native
                 * `title` here was mouse-only. */}
                <InfoTip label={`What ${g} means`} content={GREEK_LABEL[g].gloss} />
              </span>
            ))}
          </div>

          {liveStatus === "connecting" && (
            <Loading variant="block" label="Connecting to live session" className="mx-4" />
          )}
          {liveError && (
            <Failed
              title="Live session interrupted"
              message="The live ladder poll failed — quotes and greeks below may be frozen."
              detail={liveError}
              className="mx-4"
            />
          )}

          {liveLadder && (
            <>
              <div className="flex items-center justify-between border-b border-line bg-elevated/30 px-4 py-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-0.5 text-micro font-semibold ${
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
                  <Stale asOf={liveLadder.as_of} variant="line" source="IBKR" />
                  {liveLadder.stale_ms > 1500 && (
                    <span className="text-data text-warn">
                      {(liveLadder.stale_ms / 1000).toFixed(1)}s stale
                    </span>
                  )}
                </div>
                <span className="text-data text-muted">
                  {liveLevels.length} of {liveLadder.levels.length} strikes shown
                </span>
              </div>

              {/* Levels — grouped by what each number answers (OPT-12, OPT-13). */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-[var(--page-x)] py-2">
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
                <MarkerLegend codes={["ATM", "ZG", "CW", "PW", "MSI-C", "MSI-P"]} />
                <div
                  data-ladder-scroll
                  className="mt-1.5 flex-1 overflow-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
                >
                  {/* border-separate + backgrounds on the cells: a collapsed
                   * table paints no background on <thead>, so the sticky header
                   * was transparent and rows scrolled through it. One header
                   * row, not two — a two-row sticky header needs a hardcoded
                   * top offset on the second row, and the side is already
                   * carried by the c-/p- prefix and tone on every column. */}
                  <table className="w-full border-separate border-spacing-0 text-data">
                    <thead>
                      {/* Two header rows: the side is stated once as a spanning
                       * group rather than prefixed onto all 12 columns, which
                       * is what let the column set shrink from 23 to 13. */}
                      <tr className="text-micro uppercase tracking-[0.06em]">
                        <th
                          scope="colgroup"
                          colSpan={liveCols.length}
                          className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1 text-center font-semibold text-call"
                        >
                          {/* Tint as a child, not the cell background: a sticky
                           * header painted `bg-call/10` is 90% transparent, so
                           * the rows scroll straight through it. */}
                          <span className="relative block">
                            <span className="absolute inset-y-[-4px] inset-x-0 bg-call/10" />
                            <span className="relative">Calls</span>
                          </span>
                        </th>
                        <th
                          scope="col"
                          className="sticky left-0 top-0 z-30 border-x-2 border-b border-line-strong bg-elevated px-2 py-1 text-center font-semibold"
                        >
                          Strike
                        </th>
                        <th
                          scope="colgroup"
                          colSpan={liveCols.length}
                          className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1 text-center font-semibold text-put"
                        >
                          <span className="relative block">
                            <span className="absolute inset-y-[-4px] inset-x-0 bg-put/10" />
                            <span className="relative">Puts</span>
                          </span>
                        </th>
                      </tr>
                      <tr className="text-micro uppercase tracking-[0.06em]">
                        {[...liveCols].reverse().map((c) => (
                          <th key={`hc-${c.id}`} scope="col" className={`${LIVE_HEAD} text-call`}>
                            {c.gloss ? (
                              <InfoTip label={`What ${c.head} means`} content={c.gloss} className="text-call">
                                {c.head}
                              </InfoTip>
                            ) : (
                              c.head
                            )}
                          </th>
                        ))}
                        <th
                          scope="col"
                          className="sticky left-0 top-[25px] z-30 border-x-2 border-b border-line-strong bg-elevated px-2 py-1 text-center font-normal text-muted"
                        >
                          —
                        </th>
                        {liveCols.map((c) => (
                          <th key={`hp-${c.id}`} scope="col" className={`${LIVE_HEAD} text-put`}>
                            {c.gloss ? (
                              <InfoTip label={`What ${c.head} means`} content={c.gloss} className="text-put">
                                {c.head}
                              </InfoTip>
                            ) : (
                              c.head
                            )}
                          </th>
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
                          cols={liveCols}
                          scale={liveScale}
                          flash={flashStrike === level.strike}
                          copied={copiedStrike === level.strike}
                          onCopy={() => copyLiveStrike(level)}
                          rowRef={(el) => {
                            if (el) rowRefs.current.set(level.strike, el);
                            if (level.strike === liveLadder.atm_strike) spotRowRef.current = el;
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-[var(--page-x)] py-2">
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
            <p className="mb-1.5 text-body text-2">
              Click any row to copy its strike, both IVs and GEX. Greeks and quote-level detail need
              the live ladder — the switch is in the header.
            </p>
            <MarkerLegend codes={["SPOT", "ZG", "CW", "PW"]} />
            <div
              data-ladder-scroll
              className="mt-1.5 max-h-[70vh] overflow-x-auto overflow-y-auto rounded border border-line bg-surface"
            >
              {/* border-separate, not border-collapse: a collapsed table won't
               * paint backgrounds on <thead>/<tr>, so a sticky header let the
               * first data rows show through it. Backgrounds now sit on the
               * cells themselves. One header row, not two — the side is carried
               * by the put-/call- prefixes and their tone, so it stays legible
               * when the table is scrolled horizontally. */}
              <table className="w-full border-separate border-spacing-0 text-data">
                <thead>
                  {/* Calls left, puts right, both reading outward from the
                     centre strike — the same geometry as the live ladder. The
                     two modes used to be mirror images of each other, so
                     flipping the switch moved every column. */}
                  <tr className="text-micro uppercase tracking-[0.06em]">
                    <th scope="col" className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1.5 text-right font-normal text-call">call OI</th>
                    <th scope="col" className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1.5 text-right font-normal text-call">call vol</th>
                    <th scope="col" className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1.5 text-right font-normal text-call">call IV</th>
                    <th scope="col" className="sticky left-0 top-0 z-30 border-x border-b border-line bg-surface px-3 py-1.5 text-center font-semibold text-foreground">
                      strike
                    </th>
                    <th scope="col" className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1.5 text-left font-normal text-put">put IV</th>
                    <th scope="col" className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1.5 text-left font-normal text-put">put vol</th>
                    <th scope="col" className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1.5 text-left font-normal text-put">put OI</th>
                    <th scope="col" className="sticky top-0 z-20 border-b border-line bg-surface px-2 py-1.5 text-left font-normal text-muted">GEX</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isZg = i === zgIdx;
                    const isCallWall = i === callWallIdx;
                    const isPutWall = i === putWallIdx;
                    const isSpot = i === spotIdx;
                    const highlight = isZg || isCallWall || isPutWall || isSpot;
                    // border-separate means <tr> borders and the row background
                    // no longer paint under the sticky strike cell, so both are
                    // pushed down onto the cells.
                    const leftBorder = isSpot
                      ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-warn"
                      : isZg
                        ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-teal"
                        : "";
                    const strikeBg =
                      flashStrike === row.strike
                        ? "bg-teal/10"
                        : highlight
                          ? "bg-elevated"
                          : "bg-surface";
                    return (
                      <tr
                        key={row.strike}
                        ref={(el) => {
                          if (isSpot) spotRowRef.current = el;
                          if (el) rowRefs.current.set(row.strike, el);
                        }}
                        onClick={() => copyStrike(row)}
                        tabIndex={0}
                        // No per-row title: ~90 rows meant 90 copies of the
                        // same five words. Said once above the table instead.
                        aria-label={`Copy strike ${row.strike}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            copyStrike(row);
                          }
                        }}
                        className={`group cursor-pointer [&>td]:border-t [&>td]:border-line/50 hover:[&>td]:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal ${
                          highlight ? "[&>td]:bg-elevated" : ""
                        } ${flashStrike === row.strike ? "[&>td]:bg-teal/10" : ""} ${leftBorder}`}
                      >
                        <BarCell value={row.call?.oi} max={maxOi} anchor="right" tone="bg-call/20" />
                        <BarCell value={row.call?.vol} max={maxVol} anchor="right" tone="bg-call/10" />
                        <td className="px-2 py-1 text-right text-muted">{fmtIv(row.call?.iv)}</td>
                        <td
                          className={`sticky left-0 z-10 border-x border-line px-3 py-1 text-center text-foreground ${strikeBg}`}
                        >
                          <span>{row.strike}</span>
                          {copiedStrike === row.strike ? (
                            <span className="ml-1 align-middle text-micro text-teal">Copied</span>
                          ) : (
                            <span className="ml-1 align-middle text-micro text-muted opacity-0 transition-opacity group-hover:opacity-100">
                              copy
                            </span>
                          )}
                          {isSpot && <Marker text="SPOT" tone="text-warn" />}
                          {isZg && <Marker text="ZG" tone="text-teal" />}
                          {isCallWall && <Marker text="CW" tone="text-call" />}
                          {isPutWall && <Marker text="PW" tone="text-put" />}
                        </td>
                        <td className="px-2 py-1 text-left text-muted">{fmtIv(row.put?.iv)}</td>
                        <BarCell value={row.put?.vol} max={maxVol} anchor="left" tone="bg-put/10" />
                        <BarCell value={row.put?.oi} max={maxOi} anchor="left" tone="bg-put/20" />
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
                      <td colSpan={8}>
                        <Empty message="No strikes in this density band — widen it above." />
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
            <span className="tick text-title text-foreground">
              How to read this ladder
            </span>
          }
          className="rounded-md border border-line bg-elevated"
          triggerClassName="px-4 py-2.5"
        >
          <div className="grid gap-x-8 gap-y-3 border-t border-line px-4 py-3 text-body leading-relaxed text-2 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 eyebrow font-semibold text-foreground">
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
                  <b className="font-mono text-call">CW</b> /{" "}
                  <b className="font-mono text-put">PW</b> — heaviest dealer gamma above / below
                  spot: resistance and support.
                </li>
                <li>
                  <b className="font-mono text-foreground">MSI-C / MSI-P</b> — heaviest crowd
                  concentration, which is not the same thing as dealer hedging pressure.
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1.5 eyebrow font-semibold text-foreground">
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
              <Link href="/learn/options" className="text-teal hover:underline">
                Full reference →
              </Link>
            </p>
          </div>
        </Collapsible>
      </div>
    </Page>
  );
}
