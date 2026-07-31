"use client";

import Link from "next/link";
import { useCalendar, dayLabel, importanceChipClass, importanceMeta, type CalEvent } from "@/lib/calendar";
import { eventShortName } from "@/lib/eventMeta";

/** Visible one-letter rank — the dot alone was hover-only, so two 08:30 events read identically (MAC-04). */
const RANK_LETTER: Record<string, string> = { high: "H", medium: "M", low: "L" };

function Row({ ev, today }: { ev: CalEvent; today: string }) {
  const isToday = ev.date === today;
  const meta = importanceMeta(ev.importance);
  return (
    <div className={`px-3 py-1 flex items-center gap-1.5 ${isToday ? "bg-accent/5" : ""}`}>
      <span
        className={`flex-shrink-0 rounded-sm border px-1 font-mono text-[9px] leading-[14px] ${importanceChipClass(ev.importance)}`}
        title={meta.label}
      >
        {RANK_LETTER[ev.importance] ?? "·"}
        <span className="sr-only"> {meta.label}</span>
      </span>
      <span className={`text-[11px] font-mono w-9 flex-shrink-0 ${isToday ? "text-accent" : "text-muted"}`}>
        {dayLabel(ev.date, today)}
      </span>
      <span className="text-[11px] font-mono text-foreground truncate flex-1">
        {eventShortName(ev.event, ev.category, ev.ticker)}
      </span>
      {ev.time_et && <span className="text-[11px] font-mono text-muted-2 flex-shrink-0">{ev.time_et}</span>}
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
      <div className="h-[24px] flex items-center px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
          What&rsquo;s Next
        </span>
      </div>
      {events.length === 0
        ? <p className="px-3 py-1 text-[11px] font-mono text-muted-2">no events scheduled</p>
        : events.map((ev, i) => <Row key={`${ev.event}-${ev.date}-${i}`} ev={ev} today={today} />)}
      <Link href="/calendar" className="block px-3 py-1 text-[11px] font-mono text-muted hover:text-accent">
        {remaining > 0 ? `+${remaining} more · full calendar ›` : "full calendar ›"}
      </Link>
    </div>
  );
}
