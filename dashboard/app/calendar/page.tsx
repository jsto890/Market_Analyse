"use client";

import { useMemo } from "react";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import Loading from "@/components/ui/Loading";
import EventRow from "@/components/calendar/EventRow";
import MonthStrip from "@/components/calendar/MonthStrip";
import SegmentedControl from "@/components/ui/SegmentedControl";
import {
  groupBySpine,
  isEarnings,
  shortDayLabel,
  useCalendar,
  weekRangeLabel,
  type CalEvent,
} from "@/lib/calendar";
import { useWatchlistTickers } from "@/lib/watchlist";
import { useHeldPositions } from "@/lib/positions";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import Page from "@/components/ui/Page";

const HORIZONS = [
  { key: 30, label: "30d" },
  { key: 60, label: "60d" },
] as const;

/** Filters on one axis — what is on the calendar — rather than the old mix of
 * source and ownership, which made "macro only" and "my watchlist" read as
 * alternatives to each other rather than to "everything". Each option says what
 * it does; an option needing a sentence beside it would be misnamed. */
const SHOW = [
  { key: "all", label: "All" },
  { key: "high", label: "High impact" },
  { key: "watchlist", label: "Watchlist earnings" },
] as const;
type ShowMode = (typeof SHOW)[number]["key"];

function byDay(events: CalEvent[]): [string, CalEvent[]][] {
  const days = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const bucket = days.get(ev.date);
    if (bucket) bucket.push(ev);
    else days.set(ev.date, [ev]);
  }
  return Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default function CalendarPage() {
  const [horizon, setHorizon] = useLocalStorage<number>(STATIC_KEYS.calendarHorizon, 30);
  const [show, setShow] = useLocalStorage<ShowMode>(STATIC_KEYS.calendarShow, "all");
  const { data, error, isLoading } = useCalendar(horizon);
  const watchlist = useWatchlistTickers();
  const held = useHeldPositions();

  const today = data?.today ?? "";
  const all = useMemo(() => data?.events ?? [], [data]);

  const filtered = useMemo(() => {
    if (show === "all") return all;
    if (show === "high") return all.filter((ev) => ev.importance === "high");
    return all.filter(
      (ev) => isEarnings(ev) && ev.ticker != null && watchlist.has(ev.ticker.toUpperCase())
    );
  }, [all, show, watchlist]);

  const weeks = useMemo(() => groupBySpine(filtered, today), [filtered, today]);
  // Consensus, prior and actual need a paid feed that isn't wired yet. Until one
  // is, every cell of all three columns is empty — that is three columns to
  // drop, not ninety dashes to print.
  const showFigures = useMemo(
    () => all.some((e) => e.actual != null || e.consensus != null || e.prior != null),
    [all]
  );

  return (
    <Page width="wide">
      <Page.Header
        title="Calendar"
        subtitle={`Economic releases and watchlist earnings, next ${horizon} days — with what each one moves.`}
        actions={
          <div className="flex items-center gap-3">
            <SegmentedControl
              label="Horizon"
              labelHidden
              value={horizon}
              options={HORIZONS}
              onChange={setHorizon}
            />
            <SegmentedControl
              label="Show"
              labelHidden
              variant="pills"
              value={show}
              options={SHOW}
              onChange={setShow}
            />
          </div>
        }
      />

      {data && <MonthStrip events={filtered} today={today} watchlist={watchlist} />}

      {isLoading && !data && <Loading count={6} label="Loading calendar" />}
      {error && !data && (
        <Failed
          title="Calendar unavailable"
          message="The Argus API isn't answering, so the schedule could not be loaded."
        />
      )}
      {data && weeks.length === 0 && (
        <Empty message={`Nothing scheduled in the next ${horizon} days for this filter.`} />
      )}

      <div className="space-y-6">
        {weeks.map((week) => (
          <section key={week.start}>
            {/* The rule carries the heading to the right edge, so a section
               reads as a band across the page rather than a stray line of text
               above a box. */}
            <div className="mb-2 flex items-center gap-2">
              <h2 className="eyebrow shrink-0 text-foreground">{week.label}</h2>
              <span className="shrink-0 text-label text-3">{weekRangeLabel(week, today)}</span>
              <span aria-hidden className="h-px flex-1 bg-line" />
            </div>
            {/* Day beside its events, not stacked above them: the date is the
               spine you scan down, so it holds one column of its own rather
               than interrupting the run of rows every few lines. */}
            <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              {byDay(week.events).map(([date, evs]) => (
                <div key={date} className="grid grid-cols-1 sm:grid-cols-[104px_1fr]">
                  <div
                    className={`flex items-baseline gap-2 px-3 py-2 sm:flex-col sm:items-start sm:gap-0 sm:border-r sm:border-line ${
                      date === today ? "bg-accent/5" : "bg-elevated/40"
                    }`}
                  >
                    {date === today && (
                      <span className="eyebrow shrink-0 text-accent">Today</span>
                    )}
                    {/* One line. "Wednesday, Aug 5" wrapped to two in 104px and
                       repeated the month on every row of the month it heads. */}
                    <span className="font-mono text-title text-foreground">
                      {shortDayLabel(date)}
                    </span>
                  </div>
                  <div className="min-w-0 divide-y divide-line">
                    {evs.map((ev, i) => (
                      <EventRow
                        key={`${ev.event}-${ev.date}-${i}`}
                        ev={ev}
                        isWatchlist={ev.ticker != null && watchlist.has(ev.ticker.toUpperCase())}
                        held={held}
                        showFigures={showFigures}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="border-t border-line pt-3 text-body leading-relaxed text-2">
        Release dates come from the OMB/OIRA principal-federal-economic-indicator schedule and the
        Federal Reserve FOMC calendar; earnings dates are refreshed daily for tracked names and can
        move. Consensus, prior and actual figures are not ingested yet — they need a paid feed, so
        the calendar answers <em>what is scheduled and what it transmits into</em>, not{" "}
        <em>what the number printed</em>.
      </p>
    </Page>
  );
}
