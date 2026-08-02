"use client";

import Link from "next/link";
import { useCalendar, dayLabel, type CalEvent } from "@/lib/calendar";
import { eventShortName } from "@/lib/eventMeta";
import RankText from "@/components/ui/RankText";

function Row({ ev, today }: { ev: CalEvent; today: string }) {
  const isToday = ev.date === today;
  // One right-hand slot, not two columns: today's rows are already marked by the
  // tint, so the clock is the only thing left to say; a later row is placed by
  // its day, and the exact minute of next Friday is not what the rail is for.
  const when = isToday ? ev.time_et : dayLabel(ev.date, today);
  return (
    <div className={`px-3 py-1 flex items-center gap-1.5 ${isToday ? "bg-accent/5" : ""}`}>
      {/* Same rank in the same slot as the calendar page — one glyph, one
          meaning, wherever a release is listed. */}
      <RankText importance={ev.importance} className="leading-[14px]" />
      <span className={`text-body truncate flex-1 ${isToday ? "text-foreground" : "text-2"}`}>
        {eventShortName(ev.event, ev.category, ev.ticker)}
      </span>
      {when && <span className="text-data text-muted flex-shrink-0">{when}</span>}
    </div>
  );
}

export function EconCalendar({ days = 7, max = 6 }: { days?: number; max?: number }) {
  const { data } = useCalendar(days);
  const today = data?.today ?? "";
  const allEvents = data?.events ?? [];
  const events = allEvents.slice(0, max);
  const remaining = allEvents.length - events.length;

  return (
    <div className="border-t border-line-strong">
      <div className="h-[24px] flex items-center justify-between gap-2 px-3">
        <span className="eyebrow leading-none">What&rsquo;s Next</span>
        {/* The right slot carried the word "impact" — a column label for a
            column that isn't there. The block's own destination belongs here. */}
        <Link href="/calendar" className="text-label leading-none text-accent hover:underline">
          calendar ›
        </Link>
      </div>
      {events.length === 0
        ? <p className="px-3 py-1 text-body text-muted">No events scheduled.</p>
        : events.map((ev, i) => <Row key={`${ev.event}-${ev.date}-${i}`} ev={ev} today={today} />)}
      {remaining > 0 && (
        <Link href="/calendar" className="block px-3 py-1 text-body text-muted hover:text-accent">
          +{remaining} more ›
        </Link>
      )}
    </div>
  );
}
