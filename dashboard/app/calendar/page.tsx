"use client";

import Link from "next/link";
import { useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import EventRow from "@/components/calendar/EventRow";
import {
  fullDayLabel,
  groupByWeek,
  isEarnings,
  useCalendar,
  type CalEvent,
} from "@/lib/calendar";
import { useWatchlistTickers } from "@/lib/watchlist";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";

const HORIZONS = [30, 60] as const;
const SHOW = [
  { key: "all", label: "Everything" },
  { key: "macro", label: "Macro only" },
  { key: "watchlist", label: "Macro + my watchlist" },
] as const;
type ShowMode = (typeof SHOW)[number]["key"];

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <div className="flex overflow-hidden rounded border border-line">
        {options.map((o) => (
          <button
            key={String(o.key)}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={o.key === value}
            className={`px-2 py-1 text-[11px] ${
              o.key === value ? "bg-accent/20 text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [show, setShow] = useLocalStorage<ShowMode>(STATIC_KEYS.calendarShow, "watchlist");
  const { data, error, isLoading } = useCalendar(horizon);
  const watchlist = useWatchlistTickers();

  const today = data?.today ?? "";
  const all = useMemo(() => data?.events ?? [], [data]);

  const filtered = useMemo(() => {
    if (show === "all") return all;
    return all.filter((ev) => {
      if (!isEarnings(ev)) return true;
      if (show === "macro") return false;
      return ev.ticker != null && watchlist.has(ev.ticker.toUpperCase());
    });
  }, [all, show, watchlist]);

  const weeks = useMemo(() => groupByWeek(filtered, today), [filtered, today]);
  const macroCount = filtered.filter((e) => !isEarnings(e)).length;
  const earningsCount = filtered.length - macroCount;

  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
      <PageHeader
        title="Economic Calendar"
        subtitle={`Scheduled US macro releases and tracked-name earnings on one timeline — the next ${horizon} days, all times US Eastern with your local time alongside.`}
        actions={
          <Link href="/macro" className="text-[12px] text-muted hover:text-accent">
            Macro sentiment ›
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Segmented
          label="Horizon"
          value={horizon}
          options={HORIZONS.map((d) => ({ key: d, label: `${d} days` }))}
          onChange={setHorizon}
        />
        <Segmented label="Show" value={show} options={SHOW} onChange={setShow} />
        <span className="font-mono text-[11px] text-muted-2">
          {macroCount} macro · {earningsCount} earnings
        </span>
      </div>

      {isLoading && !data && (
        <p className="font-mono text-[11px] text-muted">loading calendar…</p>
      )}
      {error && !data && (
        <EmptyState message="Calendar unavailable — the Argus API isn't answering." />
      )}
      {data && weeks.length === 0 && (
        <EmptyState message={`Nothing scheduled in the next ${horizon} days for this filter.`} />
      )}

      <div className="space-y-6">
        {weeks.map((week) => (
          <section key={week.start}>
            <h2 className="tick mb-2 text-[13px] font-semibold text-foreground">{week.label}</h2>
            <div className="space-y-3">
              {byDay(week.events).map(([date, evs]) => (
                <div key={date} className="overflow-hidden rounded-md border border-line bg-surface">
                  <div
                    className={`flex items-baseline gap-2 border-b border-line px-3 py-1.5 ${
                      date === today ? "bg-accent/5" : "bg-elevated/40"
                    }`}
                  >
                    <span
                      className={`text-[12px] font-medium ${
                        date === today ? "text-accent" : "text-foreground"
                      }`}
                    >
                      {fullDayLabel(date)}
                    </span>
                    {date === today && (
                      <span className="font-mono text-[11px] text-accent">today</span>
                    )}
                    <span className="ml-auto font-mono text-[11px] text-muted-2">
                      {evs.length} {evs.length === 1 ? "event" : "events"}
                    </span>
                  </div>
                  {evs.map((ev, i) => (
                    <EventRow
                      key={`${ev.event}-${ev.date}-${i}`}
                      ev={ev}
                      isWatchlist={ev.ticker != null && watchlist.has(ev.ticker.toUpperCase())}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 border-t border-line pt-3 text-[11px] leading-relaxed text-muted-2">
        Release dates come from the OMB/OIRA principal-federal-economic-indicator schedule and the
        Federal Reserve FOMC calendar; earnings dates are refreshed daily for tracked names and can
        move. Consensus, prior and actual figures are not ingested yet — they need a paid feed, so
        the calendar answers <em>what is scheduled and what it transmits into</em>, not{" "}
        <em>what the number printed</em>.
      </p>
    </main>
  );
}
