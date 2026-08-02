"use client";

import Link from "next/link";
import { useCalendar, dayLabel, type CalEvent } from "@/lib/calendar";
import { eventShortName } from "@/lib/eventMeta";
import RankText from "@/components/ui/RankText";

function Row({ ev, today }: { ev: CalEvent; today: string }) {
  const isToday = ev.date === today;
  return (
    <div className={`px-3 py-1 flex items-center gap-1.5 ${isToday ? "bg-accent/5" : ""}`}>
      {/* Same rank in the same slot as the calendar page — one glyph, one
          meaning, wherever a release is listed. */}
      <RankText importance={ev.importance} className="leading-[14px]" />
      <span className={`text-data w-12 flex-shrink-0 ${isToday ? "text-foreground" : "text-muted"}`}>
        {dayLabel(ev.date, today)}
      </span>
      <span className="text-body text-foreground truncate flex-1">
        {eventShortName(ev.event, ev.category, ev.ticker)}
      </span>
      {ev.time_et && <span className="text-data text-muted flex-shrink-0">{ev.time_et}</span>}
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
        <span className="font-mono text-micro leading-none text-muted">impact</span>
      </div>
      {events.length === 0
        ? <p className="px-3 py-1 text-body text-muted">No events scheduled.</p>
        : events.map((ev, i) => <Row key={`${ev.event}-${ev.date}-${i}`} ev={ev} today={today} />)}
      <Link href="/calendar" className="block px-3 py-1 text-body text-muted hover:text-accent">
        {remaining > 0 ? `+${remaining} more · full calendar ›` : "full calendar ›"}
      </Link>
    </div>
  );
}
