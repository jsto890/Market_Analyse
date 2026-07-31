"use client";

import Link from "next/link";
import { useMemo } from "react";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import Loading from "@/components/ui/Loading";
import EventRow from "@/components/calendar/EventRow";
import MonthStrip from "@/components/calendar/MonthStrip";
import SegmentedControl from "@/components/ui/SegmentedControl";
import {
  fullDayLabel,
  groupBySpine,
  isEarnings,
  useCalendar,
  type CalEvent,
} from "@/lib/calendar";
import { useWatchlistTickers } from "@/lib/watchlist";
import { useHeldPositions } from "@/lib/positions";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import Page from "@/components/ui/Page";

const HORIZONS = [
  { key: 30, label: "30d", blurb: "the next month" },
  { key: 60, label: "60d", blurb: "the next two months" },
] as const;

/** Filters on one axis — what is on the calendar — rather than the old mix of
 * source and ownership, which made "macro only" and "my watchlist" read as
 * alternatives to each other rather than to "everything". */
const SHOW = [
  { key: "all", label: "All", blurb: "every scheduled release and tracked earnings date" },
  { key: "high", label: "High impact", blurb: "the prints that move the whole tape" },
  { key: "watchlist", label: "Watchlist earnings", blurb: "only names you hold or track" },
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
  const macroCount = filtered.filter((e) => !isEarnings(e)).length;
  const earningsCount = filtered.length - macroCount;

  return (
    <Page width="wide">
      <Page.Header
        title="Economic Calendar"
        subtitle={`Scheduled US macro releases and tracked-name earnings on one timeline — the next ${horizon} days, all times US Eastern with your local time alongside.`}
        actions={
          <Link href="/macro" className="text-body text-muted hover:text-accent">
            Macro sentiment ›
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <SegmentedControl label="Horizon" value={horizon} options={HORIZONS} onChange={setHorizon} />
        <SegmentedControl label="Show" value={show} options={SHOW} onChange={setShow} />
        <span className="text-data text-muted">
          {macroCount} macro · {earningsCount} earnings
        </span>
      </div>

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
            <h2 className="tick mb-2 text-title text-foreground">{week.label}</h2>
            {/* Day beside its events, not stacked above them: the date is the
               spine you scan down, so it holds one column of its own rather
               than interrupting the run of rows every few lines. */}
            <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              {byDay(week.events).map(([date, evs]) => (
                <div key={date} className="grid grid-cols-1 sm:grid-cols-[104px_1fr]">
                  <div
                    className={`flex items-baseline gap-2 px-3 py-2 sm:flex-col sm:items-start sm:gap-0.5 sm:border-r sm:border-line ${
                      date === today ? "bg-accent/5" : "bg-elevated/40"
                    }`}
                  >
                    <span
                      className={`text-body font-medium ${
                        date === today ? "text-accent" : "text-foreground"
                      }`}
                    >
                      {fullDayLabel(date)}
                    </span>
                    <span className="text-micro text-3">
                      {date === today ? "today" : `${evs.length} ${evs.length === 1 ? "event" : "events"}`}
                    </span>
                  </div>
                  <div className="min-w-0 divide-y divide-line">
                    {evs.map((ev, i) => (
                      <EventRow
                        key={`${ev.event}-${ev.date}-${i}`}
                        ev={ev}
                        isWatchlist={ev.ticker != null && watchlist.has(ev.ticker.toUpperCase())}
                        held={held}
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
