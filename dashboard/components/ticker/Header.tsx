"use client";

import useSWR from "swr";
import Badge, { BADGE_LABEL } from "@/components/ui/Badge";
import ConvictionDot from "@/components/ui/ConvictionDot";
import Gloss from "@/components/ui/Gloss";
import InfoTip from "@/components/ui/InfoTip";
import ActionBar from "@/components/ui/ActionBar";
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
  medianPeakPct?: number;
  medianDaysToPeak?: number;
}

/** The catalysts payload, as the endpoint actually sends it. There is no
 *  session field: `build_catalysts` returns a bare date, so the earnings chip
 *  has no BMO/AMC word to print (K-06). */
interface Catalysts {
  next_earnings: string | null;
}

const catalystsFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

/** Calendar days from today (UTC) to an ISO date — one basis for the chip (TH-03). */
function daysUntil(iso: string): number | null {
  const then = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}

/**
 * The comparison the two columns beside it leave the reader to do. The cohort
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

/** One column of the track-record band. */
function TrackCol({
  eyebrow,
  divide = true,
  children,
}: {
  eyebrow: string;
  divide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 p-[12px_20px] ${divide ? "border-r border-line" : ""}`}>
      <div className="eyebrow mb-1.5">{eyebrow}</div>
      {children}
    </div>
  );
}

/** A middot in the rule colour, so the facts either side read as one line. */
function Dot() {
  return <span className="text-line-strong">·</span>;
}

export default function Header({
  ticker,
  bridgeRow,
  signalHistory,
  lastClose,
  dayHigh = null,
  dayLow = null,
  medianPeakPct = 23,
  medianDaysToPeak = 7,
}: HeaderProps) {
  const { quote: quoteRes, fundamentals: fundamentalsRes } = useTickerData(ticker);
  const quote = quoteRes.data;
  const fundamentals = fundamentalsRes.data;
  const companyName = fundamentals?.name ?? null;

  const { data: catalysts } = useSWR<Catalysts>(
    `/api/argus/catalysts/${ticker}`,
    catalystsFetcher,
    { refreshInterval: 3_600_000, shouldRetryOnError: false }
  );

  const price = quote?.price ?? null;
  const changePct = quote?.change_pct ?? null;
  const change = quote?.change ?? null;

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
        ? "Earnings today"
        : earnDays === 1
          ? "Earnings tomorrow"
          : earnDays > 0
            ? `Earnings in ${earnDays}d`
            : `Earnings ${Math.abs(earnDays)}d ago`;
  const earnSoon = earnDays !== null && earnDays >= 0 && earnDays <= 10;

  // The day's position inside its own bar — the marker is the only thing on the
  // track, so an equal high and low would put it nowhere meaningful.
  const dayPos =
    mark !== null && dayLow !== null && dayHigh !== null && dayHigh > dayLow
      ? Math.min(100, Math.max(0, ((mark - dayLow) / (dayHigh - dayLow)) * 100))
      : null;

  const vol = fundamentals?.volume ?? null;
  const adv = fundamentals?.avg_volume ?? null;
  // No volume or no ADV means no line at all — a bar drawn against a figure we
  // do not have is worse than the space it fills.
  const volVsAdv = vol != null && adv != null && adv > 0 ? vol / adv : null;

  const score = bridgeRow && Number.isFinite(bridgeRow.argus_score) ? bridgeRow.argus_score : null;
  // The bridge writes agreement as a whole percent; the action card writes it as
  // a fraction. Read either without asking the caller which one it handed over.
  const agreement =
    bridgeRow && Number.isFinite(bridgeRow.agreement_pct)
      ? Math.round(bridgeRow.agreement_pct >= 2 ? bridgeRow.agreement_pct : bridgeRow.agreement_pct * 100)
      : null;

  const meta: React.ReactNode[] = [];
  if (fundamentals?.sector) meta.push(<span key="sector">{fundamentals.sector}</span>);
  if (fundamentals?.industry) meta.push(<span key="industry">{fundamentals.industry}</span>);
  if (fundamentals?.market_cap != null)
    meta.push(
      <span key="cap" className="font-mono">
        ${compactNumber(fundamentals.market_cap)}
      </span>
    );

  return (
    <section className="rounded-lg border border-line-strong bg-surface">
      {/* Band 1 — who it is, what it costs, what the model says. Fixed zone
          widths: a long company name must not push the price out of place, and
          the row must not wrap on a laptop (K-01). */}
      <div className="grid grid-cols-[1fr_320px_300px] gap-6 p-[18px_20px_16px] max-[1100px]:grid-cols-1">
        {/* Identity (K-11) */}
        <div className="flex min-w-0 flex-col gap-[5px]">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="text-display leading-none text-foreground">{ticker}</span>
            {companyName && (
              <span className="min-w-0 truncate text-title text-3">{companyName}</span>
            )}
          </div>
          {meta.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-label text-muted">
              {meta.map((m, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <Dot />}
                  {m}
                </span>
              ))}
            </p>
          )}
        </div>

        {/* Price (K-02, K-03) */}
        <div className="flex min-w-0 flex-col gap-[7px]">
          {mark !== null && (
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-display leading-none text-foreground">{mark.toFixed(2)}</span>
              {changePct !== null && (
                <span className={`text-title font-mono ${posNeg}`}>
                  {changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%
                </span>
              )}
              {change !== null && (
                <span className={`text-data ${posNeg}`}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}
                </span>
              )}
              {markBasis && (
                <InfoTip
                  content="The basis for the price shown here and for every percentage on this page."
                  label="Price basis"
                >
                  <span className="text-label text-muted-2">{markBasis}</span>
                </InfoTip>
              )}
            </div>
          )}

          {/* Day range. Same daily bar `lastClose` comes from, so the basis chip
              above qualifies it too. */}
          {dayPos !== null && dayLow !== null && dayHigh !== null && (
            <div className="flex flex-col gap-1">
              <div className="relative h-[4px] rounded-[2px] bg-gradient-to-r from-raised to-line-strong">
                <span
                  className="absolute top-[-3px] h-[10px] w-[2px] rounded-[1px] bg-foreground"
                  style={{ left: `${dayPos}%` }}
                />
              </div>
              <div className="flex justify-between text-micro text-muted">
                <span>{dayLow.toFixed(2)}</span>
                <span className="text-3">day range</span>
                <span>{dayHigh.toFixed(2)}</span>
              </div>
            </div>
          )}

          {volVsAdv !== null && vol != null && (
            <div className="flex items-center gap-2 text-label font-mono text-muted">
              <span>Vol {compactNumber(vol)}</span>
              <Dot />
              <span className={volVsAdv >= 1.5 ? "text-warn" : undefined}>
                {volVsAdv.toFixed(2)}× ADV
              </span>
              <span className="relative inline-block h-[4px] w-[40px] rounded-[2px] bg-raised">
                <span
                  className="absolute inset-y-0 left-0 rounded-[2px] bg-line-strong"
                  style={{ width: `${Math.min(volVsAdv, 1) * 100}%` }}
                />
              </span>
            </div>
          )}
        </div>

        {/* Verdict (K-04). Earnings is not here — it is the action band's chip. */}
        {bridgeRow && (
          <div className="flex min-w-0 flex-col items-start gap-2">
            <div className="flex flex-wrap items-center gap-2">
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
                <span className="inline-flex items-center rounded border border-model/50 bg-model/10 px-1.5 py-px text-label text-model">
                  <Gloss term="HC" />
                </span>
              )}
            </div>
            {score !== null && (
              <div className="text-label font-mono text-model">
                score {score.toFixed(2)}
                {agreement !== null && (
                  <span className="text-muted"> · agreement {agreement}%</span>
                )}
              </div>
            )}
            <p className="text-label text-muted">
              Model output, not a return forecast.{" "}
              <Gloss term="What HC means →" lookup="HC" />
            </p>
          </div>
        )}
      </div>

      {/* Band 2 — the verbs, on their own rule rather than floating at the end
          of whichever row they landed in (K-06). The options block is on this
          page, so that one is a jump rather than a navigation. */}
      <div className="flex items-center gap-2 border-t border-line bg-elevated p-[10px_20px]">
        <ActionBar
          symbol={ticker}
          actions={["pin", "alert", "options", "compare", "copy"]}
          optionsHref="#options"
        />
        {earnLabel && (
          <span
            className={`ml-auto rounded-[5px] px-[10px] py-[5px] text-label font-mono font-semibold ${
              earnSoon ? "border border-warn/50 bg-warn/10 text-warn" : "border border-line text-3"
            }`}
          >
            {earnLabel}
          </span>
        )}
      </div>

      {/* Band 3 — this call, the cohort it belongs to, and the comparison
          between them: three claims, three columns, none of them left for the
          reader to compute (K-05, TH-05, TH-09). */}
      {cs && (
        <div className="grid grid-cols-3 border-t border-line">
          <TrackCol eyebrow="This call">
            <p className="text-data text-2">
              called {cs.dateLabel}
              {entry !== null ? ` @ ${entry.toFixed(2)}` : ""}
              {mark !== null ? ` → ${mark.toFixed(2)}` : ""}
            </p>
            {cs.pct !== null && (
              <p className={`mt-0.5 text-data ${cs.pct >= 0 ? "text-pos" : "text-neg"}`}>
                {cs.pct >= 0 ? "+" : ""}
                {cs.pct.toFixed(1)}% <span className="text-3">in {cs.days} days</span>
              </p>
            )}
          </TrackCol>

          <TrackCol eyebrow="Cohort">
            <p className="text-data text-2">median pick peaks +{medianPeakPct}%</p>
            <p className="mt-0.5 text-data text-3">at ~{medianDaysToPeak} days</p>
          </TrackCol>

          <TrackCol eyebrow="Read" divide={false}>
            {cs.pct !== null && (
              <p className="text-balance text-label text-2">
                {cohortRead(cs.pct, cs.days, medianPeakPct, medianDaysToPeak)}
              </p>
            )}
          </TrackCol>
        </div>
      )}
    </section>
  );
}
