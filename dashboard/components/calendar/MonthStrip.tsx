"use client";

import { isEarnings, type CalEvent } from "@/lib/calendar";
import { eventShortName } from "@/lib/eventMeta";

/** "6 Aug" — a strip entry is a marker on a horizon, not a full date. */
function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * The month ahead in one line: every top-tier macro print, plus a count of the
 * watchlist earnings sharing each date. The week spine below answers "what is
 * on Thursday"; this answers "what is coming at all", which was previously only
 * reachable by scrolling the whole list.
 */
export default function MonthStrip({
  events,
  today,
  watchlist,
}: {
  events: CalEvent[];
  today: string;
  watchlist: Set<string>;
}) {
  const macro = events.filter((e) => !isEarnings(e) && e.importance === "high");
  const earningsByDate = new Map<string, number>();
  for (const e of events) {
    if (!isEarnings(e)) continue;
    if (e.ticker == null || !watchlist.has(e.ticker.toUpperCase())) continue;
    earningsByDate.set(e.date, (earningsByDate.get(e.date) ?? 0) + 1);
  }

  if (macro.length === 0 && earningsByDate.size === 0) return null;

  const dates = Array.from(
    new Set([...macro.map((e) => e.date), ...Array.from(earningsByDate.keys())])
  ).sort();

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <ol className="flex min-w-max items-stretch">
        {dates.map((date) => {
          const prints = macro.filter((e) => e.date === date);
          const earnings = earningsByDate.get(date) ?? 0;
          return (
            <li
              key={date}
              className={`min-w-[104px] max-w-[168px] border-r border-line px-2.5 py-2 last:border-r-0 ${
                date === today ? "bg-accent/5" : ""
              }`}
            >
              <p
                className={`text-micro font-semibold uppercase tracking-[0.08em] ${
                  date === today ? "text-accent" : "text-muted"
                }`}
              >
                {date === today ? "Today" : shortDate(date)}
              </p>
              {prints.map((e, i) => (
                <p key={`${e.event}-${i}`} className="truncate text-body text-foreground">
                  {eventShortName(e.event, e.category, e.ticker)}
                </p>
              ))}
              {earnings > 0 && (
                <p className="text-body text-accent">
                  {earnings} watchlist {earnings === 1 ? "print" : "prints"}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
