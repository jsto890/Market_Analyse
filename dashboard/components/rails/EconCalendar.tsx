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
        // No native title: it repeated the sr-only label mouse-only, once per
        // row. The H/M/L key sits in the section header instead.
        className={`flex-shrink-0 rounded-sm border px-1 font-mono text-micro leading-[14px] ${importanceChipClass(ev.importance)}`}
      >
        {RANK_LETTER[ev.importance] ?? "·"}
        <span className="sr-only"> {meta.label}</span>
      </span>
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
        <span className="font-mono text-micro leading-none text-muted">H·M·L impact</span>
      </div>
      {events.length === 0
        ? <p className="px-3 py-1 text-body text-muted">No events scheduled.</p>
        : events.map((ev, i) => <Row key={`${ev.event}-${ev.date}-${i}`} ev={ev} today={today} />)}
      <Link href="/calendar" className="block px-3 py-1 text-micro font-mono text-muted hover:text-accent">
        {remaining > 0 ? `+${remaining} more · full calendar ›` : "full calendar ›"}
      </Link>
    </div>
  );
}
