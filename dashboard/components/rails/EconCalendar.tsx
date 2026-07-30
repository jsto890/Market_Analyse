"use client";

import Link from "next/link";
import { useCalendar, dayLabel, importanceMeta, type CalEvent } from "@/lib/calendar";

function Row({ ev, today }: { ev: CalEvent; today: string }) {
  const isToday = ev.date === today;
  const meta = importanceMeta(ev.importance);
  return (
    <div className={`px-3 py-1 flex items-center gap-1.5 ${isToday ? "bg-accent/5" : ""}`}>
      <span className={`${meta.cls} flex-shrink-0`} title={meta.label} aria-label={meta.label} role="img" />
      <span className={`text-[11px] font-mono w-9 flex-shrink-0 ${isToday ? "text-accent" : "text-muted"}`}>
        {dayLabel(ev.date, today)}
      </span>
      <span className="text-[11px] font-mono text-foreground truncate flex-1">{ev.event}</span>
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
      {remaining > 0 && (
        <Link href="/macro" className="block px-3 py-1 text-[11px] font-mono text-muted hover:text-accent">
          +{remaining} more ›
        </Link>
      )}
    </div>
  );
}
