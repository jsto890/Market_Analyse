"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { nearestStrikeIndex, useLadder, useOdteSymbol } from "@/lib/odte";
import type { LadderRow } from "@/lib/odte";
import { useCalendar, isEarnings } from "@/lib/calendar";
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import {
  atmSkew,
  deltaSkew,
  densityCount,
  exposureTotals,
  ivSkewProfile,
  withinStrikes,
} from "@/lib/optionsAnalytics";
import { useOptionsUi } from "@/lib/optionsUi";
import { GREEK_LABEL } from "@/lib/labels";
import { greek } from "@/lib/format";
import type { GreekKind } from "@/lib/format";
import type { StrikeLevel } from "@/lib/optionsLive";
import InfoTip from "@/components/ui/InfoTip";
import Panel from "@/components/ui/Panel";
import Page from "@/components/ui/Page";
import Empty from "@/components/ui/Empty";
import Loading from "@/components/ui/Loading";

/** Dollar figures that span six orders of magnitude between a $20 name and SPY,
 * so they are read as a magnitude, not counted. */
function fmtDollars(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "+";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

interface ExposureCard {
  key: string;
  symbol: string;
  name: string;
  value: number;
  unit: string;
  /** What this number says about today's tape, in the direction it is signed. */
  tape: (v: number) => string;
  covered: number;
}

function Card({ card, strikes }: { card: ExposureCard; strikes: number }) {
  const thin = strikes > 0 && card.covered < strikes * 0.7;
  return (
    <div className="rounded-md border border-line bg-elevated p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-title text-model">{card.symbol}</span>
        <span className="text-body text-2">{card.name}</span>
        <InfoTip label={`What ${card.name} means`} content={card.tape(card.value)} />
      </div>
      <p className={`mt-1 text-display ${card.value >= 0 ? "text-pos" : "text-neg"}`}>
        {fmtDollars(card.value)}
      </p>
      <p className="text-body text-muted">{card.unit}</p>
      <p className="mt-2 border-t border-line pt-2 text-body text-2">{card.tape(card.value)}</p>
      {thin && (
        <p className="mt-1 text-body text-warn">
          {card.covered} of {strikes} strikes quoted this greek — read it as a direction, not a
          level.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- mirrored table */

/** Greek columns in spec order **outward from the strike**: Δ · Γ · Θ · Vega.
 * Calls render this reversed, so both sides read from the centre — the same
 * geometry as the ladder, which is the point of mirroring it here. */
const OUTWARD: GreekKind[] = ["delta", "gamma", "theta", "vega"];

const CELL = "px-[8px] py-[6px]";

/** Second sticky header row. `top-[30px]` clears the Calls/Puts band above it:
 * 7px + 7px padding over an 11px/1.35 line, plus its 1px rule. A two-row sticky
 * header has no way to measure the first row from CSS — same trade the ladder
 * makes. */
const GREEK_HEAD =
  "sticky top-[30px] z-20 border-b border-line bg-elevated px-[8px] py-[7px] font-normal";

/** Tone by greek, one step brighter on the ATM row — the row you actually read.
 * Theta is the only one carrying a sign that means money, so it takes `--red`. */
function greekTone(g: GreekKind, atm: boolean): string {
  if (g === "theta") return "text-neg";
  if (g === "delta") return atm ? "text-foreground" : "text-2";
  return atm ? "text-2" : "text-3";
}

function Marker({ text, tone }: { text: string; tone: string }) {
  return <span className={`ml-1 align-middle text-micro ${tone}`}>{text}</span>;
}

function GreekCell({
  quote,
  g,
  anchor,
  atm,
  tint,
}: {
  quote: StrikeLevel["call"];
  g: GreekKind;
  anchor: "left" | "right";
  atm: boolean;
  tint: string;
}) {
  return (
    <td
      className={`${CELL} ${anchor === "right" ? "text-right" : "text-left"} ${greekTone(g, atm)} ${tint}`}
    >
      {quote[g] != null ? greek(quote[g], g) : "—"}
    </td>
  );
}

/* --------------------------------------------------------- term structure */

interface TermBar {
  expiry: string;
  label: string;
  /** ATM implied vol for the expiry, as a fraction. */
  iv: number;
  /** High-importance macro release the expiry is the first to span, if any. */
  event: string | null;
}

function dayMonth(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/* --------------------------------------------------------------- skew plot */

interface SkewDot {
  strike: number;
  /** The out-of-the-money leg's IV — puts below spot, calls above. */
  iv: number;
}

function SkewTooltip({ active, payload }: { active?: boolean; payload?: { payload: SkewDot }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-line bg-elevated px-3 py-2 text-data">
      <p className="text-foreground">strike {p.strike.toFixed(0)}</p>
      <p className="text-2">IV {(p.iv * 100).toFixed(1)}%</p>
    </div>
  );
}

export default function OptionsGreeksPage() {
  const [activeSymbol] = useOdteSymbol();
  const { live, density, expiry } = useOptionsUi();
  const count = densityCount(density);

  const { data, isLoading } = useLadder(activeSymbol, 4, 0.5);
  const { ladder: liveLadder, status } = useOptionsLivePoller(activeSymbol, expiry || "0DTE", live);
  // The only feed that says which expiry prices an event. Two weeks covers the
  // four nearest expiries the ladder returns.
  const { data: calendar } = useCalendar(14);

  const levels = useMemo<StrikeLevel[]>(
    () => withinStrikes(liveLadder?.levels ?? [], liveLadder?.spot ?? null, count),
    [liveLadder, count]
  );
  const spot = liveLadder?.spot ?? data?.spot ?? null;
  const totals = useMemo(() => exposureTotals(levels, spot), [levels, spot]);

  const cards: ExposureCard[] = [
    {
      key: "dex",
      symbol: GREEK_LABEL.delta.symbol,
      name: "Delta exposure",
      value: totals.dex,
      unit: "dollars of underlying dealers are holding",
      covered: totals.covered.dex,
      tape: (v) =>
        v >= 0
          ? "Dealers are net long the underlying against this book — they sell into strength to stay flat."
          : "Dealers are net short the underlying against this book — they buy into strength to stay flat.",
    },
    {
      key: "gex",
      symbol: GREEK_LABEL.gamma.symbol,
      name: "Gamma exposure",
      value: totals.gex,
      unit: "dollars of delta dealers must trade per 1% move",
      covered: totals.covered.gex,
      tape: (v) =>
        v >= 0
          ? "Long gamma: dealer hedging leans against the move, so ranges compress and breakouts fade."
          : "Short gamma: dealer hedging runs with the move, so ranges extend and breaks accelerate.",
    },
    {
      key: "vex",
      symbol: GREEK_LABEL.vega.symbol,
      name: "Vega exposure",
      value: totals.vex,
      unit: "dollars per 1 point of implied volatility",
      covered: totals.covered.vex,
      tape: (v) =>
        v >= 0
          ? "Dealers gain as implied vol rises — a vol spike works for the book, so they have no reason to chase it."
          : "Dealers lose as implied vol rises — a vol spike pressures the book, which is what makes vol expansions self-feeding.",
    },
    {
      key: "tex",
      symbol: GREEK_LABEL.theta.symbol,
      name: "Theta exposure",
      value: totals.tex,
      unit: "dollars of decay accruing to dealers per day",
      covered: totals.covered.tex,
      tape: (v) =>
        v >= 0
          ? "Dealers collect decay: time passing pays the book, so they are content to sit."
          : "Dealers pay decay: time passing costs the book, so they need the move to arrive.",
    },
  ];

  /* Strike markers, carried over from the ladder so the two pages mark the same
     rows. Max pain is a price, not a strike, so it lands on the nearest one. */
  const atmStrike = liveLadder?.atm_strike ?? null;
  const maxPainStrike =
    liveLadder?.max_pain != null && levels.length > 0
      ? levels[nearestStrikeIndex(levels, liveLadder.max_pain)]?.strike ?? null
      : null;

  /* Skew reads off the live chain when it is on, and off the daily snapshot when
     it is not — the shape is in the IVs, which both carry. */
  const snapshotRows = useMemo<LadderRow[]>(() => {
    const expiries = data?.expiries ?? [];
    const chosen = expiries.find((e) => e.expiry === expiry) ?? expiries[0];
    return withinStrikes(chosen?.rows ?? [], data?.spot ?? null, count);
  }, [data, expiry, count]);

  const skewDots = useMemo(() => {
    const source = levels.length > 0 ? levels : snapshotRows;
    const points = ivSkewProfile(source);
    if (spot == null) return { puts: [], calls: [], atm: [] as SkewDot[] };
    let atmIdx = -1;
    let bestErr = Infinity;
    const dots: (SkewDot | null)[] = points.map((p, i) => {
      // The out-of-the-money leg is the one that trades, so it is the one whose
      // IV describes the wing. Below spot that is the put, above it the call.
      const iv = p.strike < spot ? (p.putIv ?? p.callIv) : (p.callIv ?? p.putIv);
      if (iv == null || !Number.isFinite(iv)) return null;
      const err = Math.abs(p.strike - spot);
      if (err < bestErr) {
        bestErr = err;
        atmIdx = i;
      }
      return { strike: p.strike, iv };
    });
    const puts: SkewDot[] = [];
    const calls: SkewDot[] = [];
    const atm: SkewDot[] = [];
    dots.forEach((d, i) => {
      if (!d) return;
      if (i === atmIdx) atm.push(d);
      else if (d.strike < spot) puts.push(d);
      else calls.push(d);
    });
    return { puts, calls, atm };
  }, [levels, snapshotRows, spot]);

  const skewRead = useMemo(() => {
    const source = levels.length > 0 ? levels : snapshotRows;
    const atm = atmSkew(ivSkewProfile(source), spot);
    if (atm == null) return null;
    const rr = levels.length > 0 ? deltaSkew(levels) : null;
    const lead =
      atm > 0.015
        ? "Downside is bid over upside"
        : atm < -0.015
          ? "Upside is being chased over downside"
          : "Neither wing is being paid up for";
    const wing = atm >= 0 ? "put-over-call" : "call-over-put";
    const tail =
      rr != null ? `, ${Math.abs(rr * 100).toFixed(1)}pt at 25 delta` : "";
    return `${lead} — ${Math.abs(atm * 100).toFixed(1)}pt ${wing} skew at the money${tail}.`;
  }, [levels, snapshotRows, spot]);

  /* Term structure. ATM implied vol per expiry, from the snapshot ladder — the
     live poller only ever holds one expiry, so it cannot draw a curve. */
  const termBars = useMemo<TermBar[]>(() => {
    const px = data?.spot ?? null;
    if (px == null) return [];
    const events = (calendar?.events ?? []).filter(
      (e) => e.importance === "high" && !isEarnings(e)
    );
    const bars: TermBar[] = [];
    let prev: string | null = null;
    for (const e of data?.expiries ?? []) {
      const quoted = e.rows.filter((r) => r.call?.iv != null || r.put?.iv != null);
      if (quoted.length === 0) {
        prev = e.expiry;
        continue;
      }
      const atm = quoted.reduce((best, r) =>
        Math.abs(r.strike - px) < Math.abs(best.strike - px) ? r : best
      );
      const ivs = [atm.call?.iv, atm.put?.iv].filter(
        (v): v is number => v != null && Number.isFinite(v)
      );
      if (ivs.length === 0) {
        prev = e.expiry;
        continue;
      }
      // The first expiry to span a release is the one that prices it.
      const window = prev;
      const spans = events.find((ev) => (window == null || ev.date > window) && ev.date <= e.expiry);
      bars.push({
        expiry: e.expiry,
        label: calendar?.today === e.expiry ? "0DTE" : dayMonth(e.expiry),
        iv: ivs.reduce((a, b) => a + b, 0) / ivs.length,
        event: spans?.event ?? null,
      });
      prev = e.expiry;
    }
    return bars;
  }, [data, calendar]);

  const maxTermIv = Math.max(0, ...termBars.map((b) => b.iv));
  const eventBar = termBars.find((b) => b.event);

  const hasAside = skewDots.puts.length + skewDots.calls.length + skewDots.atm.length > 0 || termBars.length > 0;

  return (
    <Page width="wide">
      {!live && (
        <p className="rounded border border-line bg-elevated px-3 py-2 text-body text-2">
          Aggregate exposure and per-strike greeks are computed from per-contract greeks, which only
          the live session carries — turn <b className="text-foreground">Data · Live</b> on in the
          header. Skew and term structure read off the daily snapshot and are shown either way.
        </p>
      )}

      {live && status === "connecting" && !liveLadder && (
        <Loading variant="block" label="Connecting to live session" />
      )}

      {live && liveLadder && levels.length === 0 && (
        <Empty message="No strikes in this window — widen Strikes on the ladder tab." />
      )}

      {levels.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.key} card={c} strikes={levels.length} />
            ))}
          </div>

          {/* Vanna and charm are the two the desk actually asks for next, and
             neither is derivable from what the feed sends: both are second-order
             partials that need a pricing model over the surface, not a quote.
             Stated rather than approximated. */}
          <p className="text-body text-2">
            Vanna (dΔ/dvol) and charm (dΔ/dtime) are not shown: the feed carries first-order greeks
            per contract, and deriving the cross-partials needs a fitted volatility surface this
            stack does not build.
          </p>
        </>
      )}

      {/* Table left, skew and term structure in a 372px aside — the mock's
         `1fr 372px`. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_372px]">
        {levels.length > 0 && (
          <Panel
            title="Greeks by strike"
            count={levels.length}
            subtitle={`same mirror as the ladder · ${expiry || "0DTE"}`}
            readThis={
              <>
                <b className="font-mono text-2">Δ</b> is roughly the odds of finishing in the money.{" "}
                <b className="font-mono text-2">Γ</b> is how fast that changes, and it peaks at the
                money. <b className="font-mono text-2">Θ</b> is what you pay per day to hold.{" "}
                <b className="font-mono text-2">Vega</b> is what a one-point move in implied vol is
                worth.
              </>
            }
          >
            <div className="-mx-4 -my-3 max-h-[60vh] overflow-auto">
              {/* Mirrored on the ladder's tracks — 1fr×4 either side of a 96px
               * strike gutter, calls right-aligned and puts left, so both sides
               * read outward from the centre. border-separate, not collapse: a
               * collapsed table paints no background on <thead>, so the sticky
               * header would let rows scroll through it. */}
              <table className="w-full table-fixed border-separate border-spacing-0 text-data">
                <colgroup>
                  <col span={4} />
                  <col className="w-[96px]" />
                  <col span={4} />
                </colgroup>
                <thead>
                  <tr className="text-micro uppercase tracking-[0.14em]">
                    <th
                      scope="colgroup"
                      colSpan={4}
                      className="sticky top-0 z-20 border-b border-line-strong bg-elevated py-[7px] text-center font-semibold text-call"
                    >
                      {/* Tint as a child, not the cell background: a sticky
                       * header painted `bg-call/10` is mostly transparent, so
                       * the rows scroll straight through it. */}
                      <span className="relative block">
                        <span className="absolute inset-x-0 inset-y-[-7px] bg-call/10" />
                        <span className="relative">Calls</span>
                      </span>
                    </th>
                    <th
                      scope="col"
                      rowSpan={2}
                      className="sticky top-0 z-30 border-x-2 border-b border-line-strong bg-raised px-[6px] text-center align-middle text-micro font-semibold tracking-[0.06em] text-foreground"
                    >
                      Strike
                    </th>
                    <th
                      scope="colgroup"
                      colSpan={4}
                      className="sticky top-0 z-20 border-b border-line-strong bg-elevated py-[7px] text-center font-semibold text-put"
                    >
                      <span className="relative block">
                        <span className="absolute inset-x-0 inset-y-[-7px] bg-put/10" />
                        <span className="relative">Puts</span>
                      </span>
                    </th>
                  </tr>
                  <tr className="text-micro uppercase tracking-[0.06em] text-muted">
                    {[...OUTWARD].reverse().map((g) => (
                      <th
                        key={`hc-${g}`}
                        scope="col"
                        className={`${GREEK_HEAD} text-right`}
                      >
                        <InfoTip label={`What call ${g} means`} content={GREEK_LABEL[g].gloss}>
                          {g === "vega" ? "Vega" : GREEK_LABEL[g].symbol}
                        </InfoTip>
                      </th>
                    ))}
                    {OUTWARD.map((g) => (
                      <th
                        key={`hp-${g}`}
                        scope="col"
                        className={`${GREEK_HEAD} text-left`}
                      >
                        <InfoTip label={`What put ${g} means`} content={GREEK_LABEL[g].gloss}>
                          {g === "vega" ? "Vega" : GREEK_LABEL[g].symbol}
                        </InfoTip>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l) => {
                    const isAtm = l.strike === atmStrike;
                    const isZg = l.strike === liveLadder?.zero_gamma_strike;
                    const isCw = l.strike === liveLadder?.call_wall_strike;
                    const isPw = l.strike === liveLadder?.put_wall_strike;
                    const isMp = l.strike === maxPainStrike;
                    // border-separate means the <tr> background no longer
                    // paints, and a `[&>td]` variant outranks a class on the td
                    // itself — which would repaint the strike gutter too. So the
                    // tint is passed down to the greek cells and the gutter keeps
                    // its own surface.
                    const tint = isAtm
                      ? "bg-raised"
                      : isZg || isCw
                        ? "bg-teal/5"
                        : isPw
                          ? "bg-put/5"
                          : "";
                    const rule = isAtm
                      ? "[&>td]:border-t [&>td]:border-t-line-strong [&>td]:border-b-line-strong"
                      : "";
                    return (
                      <tr key={l.strike} className={`[&>td]:border-b [&>td]:border-line/50 ${rule}`}>
                        {[...OUTWARD].reverse().map((g) => (
                          <GreekCell
                            key={`c-${g}`}
                            quote={l.call}
                            g={g}
                            anchor="right"
                            atm={isAtm}
                            tint={tint}
                          />
                        ))}
                        <td
                          className={`border-x-2 border-line-strong px-[6px] py-[6px] text-center ${
                            isAtm
                              ? "border-l-warn bg-raised font-bold text-foreground"
                              : "bg-elevated font-semibold text-foreground"
                          }`}
                        >
                          <span>{l.strike.toFixed(0)}</span>
                          {isAtm && <Marker text="ATM" tone="text-warn" />}
                          {isZg && <Marker text="ZG" tone="text-teal" />}
                          {isCw && <Marker text="CW" tone="text-call" />}
                          {isPw && <Marker text="PW" tone="text-put" />}
                          {isMp && <Marker text="MP" tone="text-muted" />}
                        </td>
                        {OUTWARD.map((g) => (
                          <GreekCell
                            key={`p-${g}`}
                            quote={l.put}
                            g={g}
                            anchor="left"
                            atm={isAtm}
                            tint={tint}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {hasAside && (
          // Without the live table there is nothing to sit beside, so the two
          // panels take the full width side by side rather than stranding a
          // column.
          <div
            className={
              levels.length > 0
                ? "flex flex-col gap-3"
                : "grid gap-4 lg:col-span-2 lg:grid-cols-2"
            }
          >
            {skewDots.atm.length + skewDots.puts.length + skewDots.calls.length > 0 && (
              <Panel title="Skew" subtitle="IV by strike" readThis={skewRead ?? undefined}>
                <ResponsiveContainer width="100%" height={168}>
                  <ScatterChart margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis
                      type="number"
                      dataKey="strike"
                      domain={["dataMin", "dataMax"]}
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted)"
                    />
                    <YAxis
                      type="number"
                      dataKey="iv"
                      domain={["auto", "auto"]}
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted)"
                      width={38}
                    />
                    <Tooltip content={<SkewTooltip />} />
                    {spot != null && (
                      <ReferenceLine x={spot} stroke="var(--warn)" strokeDasharray="4 2" />
                    )}
                    <Scatter data={skewDots.puts} fill="var(--put)" isAnimationActive={false} />
                    <Scatter data={skewDots.calls} fill="var(--call)" isAnimationActive={false} />
                    {/* Drawn last so the at-the-money strike sits on top of its
                       neighbours rather than under them. */}
                    <Scatter
                      data={skewDots.atm}
                      fill="var(--foreground)"
                      shape="circle"
                      isAnimationActive={false}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
                <p className="mt-2 text-body text-muted">
                  <span className="text-put">puts</span> below spot ·{" "}
                  <span className="text-call">calls</span> above · amber line marks the money
                </p>
              </Panel>
            )}

            {termBars.length > 0 && (
              <Panel
                title="Term structure"
                subtitle="ATM implied vol by expiry"
                readThis={
                  eventBar
                    ? `${eventBar.label} is the first expiry spanning ${eventBar.event} — anything you hold through that date is paying an event premium.`
                    : undefined
                }
              >
                <div className="flex flex-col gap-2">
                  {termBars.map((b) => (
                    <div key={b.expiry} className="flex items-center gap-2">
                      <span
                        className={`w-[46px] shrink-0 text-data ${b.event ? "text-warn" : "text-muted"}`}
                      >
                        {b.label}
                      </span>
                      <span className="relative h-3 flex-1 rounded-[2px] bg-raised">
                        <span
                          className={`absolute inset-y-0 left-0 rounded-[2px] ${
                            b.event ? "bg-warn" : "bg-muted"
                          }`}
                          style={{
                            width: `${maxTermIv > 0 ? (b.iv / maxTermIv) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <span
                        className={`w-[44px] shrink-0 text-right text-data ${
                          b.event ? "text-warn" : "text-2"
                        }`}
                      >
                        {(b.iv * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>

      {!live && isLoading && <Loading variant="block" label="Loading snapshot" />}
    </Page>
  );
}
