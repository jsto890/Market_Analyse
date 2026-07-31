"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import Badge, { BADGE_LABEL } from "@/components/ui/Badge";
import ConvictionDot from "@/components/ui/ConvictionDot";
import Gloss from "@/components/ui/Gloss";
import InfoTip from "@/components/ui/InfoTip";
import PinToggle from "@/components/ui/PinToggle";
import type { BridgeRow, Conviction } from "@/types/bridge";
import { calledSince } from "@/lib/called-since";
import { compactNumber } from "@/lib/format";
import { useTickerData } from "@/lib/useTickerData";

interface SignalRow {
  date: string;
  report_group: string | null;
  action_label: string | null;
  combined_score: number | null;
  entry: number | null;
}

interface HeaderProps {
  ticker: string;
  bridgeRow: BridgeRow | null;
  signalHistory: SignalRow[];
  lastClose: number | null; // from server-fetched history bars
  /** High/low of the same bar `lastClose` came from — one basis for both. */
  dayHigh?: number | null;
  dayLow?: number | null;
  /** Bar-derived 52-week range, used when yfinance fundamentals are unavailable.
   *  The chart info strip used to carry this; the header is now its only home. */
  week52LowBars?: number | null;
  week52HighBars?: number | null;
  medianPeakPct?: number;
  medianDaysToPeak?: number;
}

const catalystsFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

/** Calendar days from today (UTC) to an ISO date — the same basis CatalystStrip prints (TH-03). */
function daysUntil(iso: string): number | null {
  const then = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}

function fmtDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

/**
 * The comparison the two lines above it leave the reader to do. The cohort
 * number is a *peak*, so a call sitting at 40% of it hasn't failed — it may not
 * have run yet, which is what the window clause is for.
 */
function cohortRead(pct: number, days: number, peakPct: number, peakDays: number): string {
  const left = peakDays - days;
  const window = left > 0 ? `~${left}d of that window left` : "past that window";
  if (pct <= 0) return `Behind the cohort from the entry, ${window}.`;
  if (pct >= peakPct) return `Past the cohort's median peak, ${window}.`;
  return `${Math.round((pct / peakPct) * 100)}% of the cohort's median peak, ${window}.`;
}

/** One zone of the header. Each fact belongs to exactly one (TH-08). */
function Zone({ divide = true, children }: { divide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${divide ? "border-l border-line pl-5" : ""}`}>{children}</div>
  );
}

function CopyButton({ ticker }: { ticker: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(ticker).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          },
          () => {}
        );
      }}
      className="rounded border border-line px-1.5 py-0.5 text-micro text-muted transition-colors hover:border-line-strong hover:text-foreground"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function Header({
  ticker,
  bridgeRow,
  signalHistory,
  lastClose,
  dayHigh = null,
  dayLow = null,
  week52LowBars = null,
  week52HighBars = null,
  medianPeakPct = 23,
  medianDaysToPeak = 7,
}: HeaderProps) {
  const { quote: quoteRes, fundamentals: fundamentalsRes } = useTickerData(ticker);
  const quote = quoteRes.data;
  const fundamentals = fundamentalsRes.data;
  const companyName = fundamentals?.name ?? null;

  // Same key as CatalystStrip — SWR dedupes, so both read one earnings date (TH-03).
  const { data: catalysts } = useSWR<{ next_earnings: string | null }>(
    `/api/argus/catalysts/${ticker}`,
    catalystsFetcher,
    { refreshInterval: 3_600_000, shouldRetryOnError: false }
  );

  const price = quote?.price ?? null;
  const changePct = quote?.change_pct ?? null;

  const posNeg = changePct === null ? "text-muted" : changePct >= 0 ? "text-pos" : "text-neg";

  // One mark price, with its basis named — the header used to show the live quote
  // and then re-price the call against the last daily close as if both were "the
  // price" (TH-04).
  const mark = price ?? lastClose;
  const markBasis = price !== null ? "live" : lastClose !== null ? "last close" : null;

  const firstRow = signalHistory.length > 0 ? signalHistory[0] : null;
  const entry = firstRow?.entry ?? null;
  const cs = firstRow ? calledSince(firstRow.date, entry, mark) : null;

  // Earnings: one source (the catalysts endpoint), one date basis. The bridge's
  // own countdown is only a fallback for names the calendar doesn't cover.
  const nextEarnings = catalysts?.next_earnings ?? null;
  const earnDays = nextEarnings ? daysUntil(nextEarnings) : (bridgeRow?.earnings_in_days ?? null);
  const earnLabel =
    earnDays === null
      ? null
      : earnDays === 0
        ? "earnings today"
        : earnDays === 1
          ? "earnings tomorrow"
          : earnDays > 0
            ? `earnings in ${earnDays}d`
            : `earnings ${Math.abs(earnDays)}d ago`;

  const w52h = fundamentals?.week52_high ?? week52HighBars;
  const w52l = fundamentals?.week52_low ?? week52LowBars;
  const rangePos =
    mark !== null && w52h !== null && w52l !== null && w52h > w52l
      ? Math.min(100, Math.max(0, ((mark - w52l) / (w52h - w52l)) * 100))
      : null;

  const vol = fundamentals?.volume ?? null;
  const adv = fundamentals?.avg_volume ?? null;
  const volVsAdv = vol !== null && adv !== null && adv > 0 ? vol / adv : null;

  return (
    <div className="px-4 py-3.5">
      {/* Three zones — who it is, what it costs, what the model says — then the
          verbs. Each fact sits in exactly one zone (TH-08). */}
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        {/* Identity */}
        <Zone divide={false}>
          <span className="block text-display leading-none text-foreground">{ticker}</span>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-data text-muted">
            {companyName && <span className="max-w-[280px] truncate">{companyName}</span>}
            {fundamentals?.sector && <Meta>{fundamentals.sector}</Meta>}
            {fundamentals?.industry && (
              <Meta>
                <span className="text-muted-2">{fundamentals.industry}</span>
              </Meta>
            )}
            {fundamentals?.market_cap != null && (
              <Meta>mkt cap {compactNumber(fundamentals.market_cap)}</Meta>
            )}
          </p>
        </Zone>

        {/* Price */}
        <Zone>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-title font-mono tabular-nums leading-none text-foreground">
              {mark !== null ? mark.toFixed(2) : "—"}
            </span>
            {changePct !== null && (
              <span className={`text-data ${posNeg}`}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            )}
            {markBasis && (
              <InfoTip
                content="The basis for the price shown here and for every percentage on this page."
                label="Price basis"
              >
                <span className="text-micro text-muted-2">{markBasis}</span>
              </InfoTip>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-data text-muted">
            {dayLow !== null && dayHigh !== null && (
              // Same daily bar `lastClose` comes from, so the basis chip above
              // qualifies this too.
              <Meta>
                day {dayLow.toFixed(2)}–{dayHigh.toFixed(2)}
              </Meta>
            )}
            {volVsAdv !== null && (
              <Meta>
                vol {compactNumber(vol)}{" "}
                <span className={volVsAdv >= 1.5 ? "text-warn" : "text-muted-2"}>
                  ({volVsAdv.toFixed(1)}× ADV)
                </span>
              </Meta>
            )}
            {w52l !== null && w52h !== null && (
              <Meta>
                52w {w52l.toFixed(2)}–{w52h.toFixed(2)}
                {rangePos !== null && (
                  <span className="ml-1 text-muted-2">({Math.round(rangePos)}% of range)</span>
                )}
              </Meta>
            )}
          </p>
        </Zone>

        {/* Verdict. No rule: this is the zone that wraps to a second line on a
            laptop, and a rule left hanging at the start of a row reads as an
            indent rather than a divider. */}
        {(bridgeRow || earnLabel) && (
          <Zone divide={false}>
            {bridgeRow && (
              <div className="flex flex-wrap items-center gap-1.5">
                {bridgeRow.argus_verdict === "SHORT" ? (
                  <Badge
                    variant="verdict"
                    value={bridgeRow.argus_verdict}
                    label={BADGE_LABEL[bridgeRow.argus_verdict]}
                  />
                ) : (
                  <Badge
                    variant="tier"
                    value={bridgeRow.action_label}
                    label={BADGE_LABEL[bridgeRow.action_label]}
                  />
                )}
                <ConvictionDot value={bridgeRow.conviction as Conviction} />
                {bridgeRow.high_conviction && (
                  // The glossary used to sit under the header as body copy on
                  // every ticker; it belongs on the chip it explains (TH-01).
                  <span className="inline-flex items-center rounded border border-model/50 bg-model/10 px-1.5 py-px text-micro text-model">
                    <Gloss term="HC" />
                  </span>
                )}
              </div>
            )}
            {earnLabel && (
              <p className="mt-1.5 text-data text-muted">
                <span
                  className={
                    earnDays !== null && earnDays >= 0 && earnDays <= 10
                      ? "rounded border border-warn/50 bg-warn/10 px-1.5 py-px text-warn"
                      : ""
                  }
                >
                  {earnLabel}
                  {nextEarnings ? ` · ${fmtDay(nextEarnings)}` : ""}
                </span>
              </p>
            )}
          </Zone>
        )}

        {/* Actions (TH-07) */}
        <div className="ml-auto flex items-center gap-1.5">
          <PinToggle symbol={ticker} />
          <CopyButton ticker={ticker} />
          <Link
            href={`/alerts?symbol=${ticker}`}
            className="rounded border border-line px-1.5 py-0.5 text-micro text-muted transition-colors hover:border-line-strong hover:text-foreground"
          >
            Alert
          </Link>
          <Link
            href="#options"
            className="rounded border border-line px-1.5 py-0.5 text-micro text-muted transition-colors hover:border-line-strong hover:text-foreground"
          >
            Options ↓
          </Link>
          {/* The screener is the only surface that scores several names side by
              side, so Compare opens it seeded with this one. */}
          <Link
            href={`/screener?symbols=${ticker}`}
            className="rounded border border-line px-1.5 py-0.5 text-micro text-muted transition-colors hover:border-line-strong hover:text-foreground"
          >
            Compare
          </Link>
        </div>
      </div>

      {/* This call, the cohort it belongs to, and the comparison between them —
          three claims, three lines, none of them left for the reader to compute
          (TH-05, TH-09). */}
      {cs && (
        <div className="mt-2 border-t border-line pt-2 text-data">
          <p className="text-foreground/85">
            <span className="mr-2 inline-block w-[78px] whitespace-nowrap text-micro text-muted-2">This call</span>
            called {cs.dateLabel}
            {entry !== null ? ` @ ${entry.toFixed(2)}` : ""}
            {cs.pct !== null && mark !== null ? (
              <>
                {" → "}
                {mark.toFixed(2)}{" "}
                <span className={cs.pct >= 0 ? "text-pos" : "text-neg"}>
                  ({cs.pct >= 0 ? "+" : ""}
                  {cs.pct.toFixed(1)}%, {cs.days}d)
                </span>
              </>
            ) : null}
          </p>
          <p className="text-muted">
            <span className="mr-2 inline-block w-[78px] whitespace-nowrap text-micro text-muted-2">Cohort</span>
            median pick peaks +{medianPeakPct}% @ ~{medianDaysToPeak}d — a base rate for calls like
            this one, not a target for this one.
          </p>
          {cs.pct !== null && (
            <p className="text-muted">
              <span className="mr-2 inline-block w-[78px] whitespace-nowrap text-micro text-muted-2">Read</span>
              {cohortRead(cs.pct, cs.days, medianPeakPct, medianDaysToPeak)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
