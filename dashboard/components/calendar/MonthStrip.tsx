"use client";

import { isEarnings, sessionsUntil, type CalEvent } from "@/lib/calendar";
import { eventShortName } from "@/lib/eventMeta";

/** "6 Aug" — a marker on a horizon, not a full date. */
function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Near enough that a name reporting is something you plan around now, rather
 *  than something that is merely on the horizon. */
const SOON_SESSIONS = 8;

/**
 * The month ahead in one card: the top-tier macro prints by name and date, and
 * how many tracked names report. The week spine below answers "what is on
 * Thursday"; this answers "what is coming at all", which was otherwise only
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
  const macro = events
    .filter((e) => !isEarnings(e) && e.importance === "high")
    .sort((a, b) => a.date.localeCompare(b.date));

  // Earliest print per name: a ticker with two dates in the horizon is one name
  // reporting, and it is the nearer date that decides whether it is imminent.
  const firstPrint = new Map<string, string>();
  for (const e of events) {
    if (!isEarnings(e) || e.ticker == null) continue;
    const t = e.ticker.toUpperCase();
    if (!watchlist.has(t)) continue;
    const seen = firstPrint.get(t);
    if (!seen || e.date < seen) firstPrint.set(t, e.date);
  }
  const names = firstPrint.size;
  const soon = Array.from(firstPrint.values()).filter(
    (d) => sessionsUntil(today, d) <= SOON_SESSIONS
  ).length;

  if (macro.length === 0 && names === 0) return null;

  return (
    <div className="rounded-md border border-line bg-elevated px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="eyebrow shrink-0">Month ahead</p>
        {macro.length > 0 && (
          <>
            <span className="shrink-0 text-body text-2">
              {macro.length} top-tier {macro.length === 1 ? "print" : "prints"}:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {macro.map((e, i) => (
                <span
                  key={`${e.event}-${e.date}-${i}`}
                  className="whitespace-nowrap rounded border border-neg/40 px-1.5 py-0.5 font-mono text-label font-semibold text-neg"
                >
                  {eventShortName(e.event, e.category, e.ticker)} · {shortDate(e.date)}
                </span>
              ))}
            </div>
          </>
        )}
        {names > 0 && (
          <span className="ml-auto shrink-0 text-body text-3">
            {names} watchlist {names === 1 ? "name reports" : "names report"}
            {soon > 0 && ` · ${soon} in the next ${SOON_SESSIONS} sessions`}
          </span>
        )}
      </div>
    </div>
  );
}
