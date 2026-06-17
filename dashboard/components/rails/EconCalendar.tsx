"use client";

import { useCalendar, dayLabel, importanceColor, type CalEvent } from "@/lib/calendar";

function Row({ ev, today }: { ev: CalEvent; today: string }) {
  const isToday = ev.date === today;
  return (
    <div className={`px-3 py-1 flex items-center gap-1.5 ${isToday ? "bg-accent/5" : ""}`}>
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${importanceColor(ev.importance)}`} />
      <span className={`text-[10px] font-mono w-9 flex-shrink-0 ${isToday ? "text-accent" : "text-muted"}`}>
        {dayLabel(ev.date, today)}
      </span>
      <span className="text-[10px] font-mono text-foreground truncate flex-1">{ev.event}</span>
      {ev.time_et && <span className="text-[9px] font-mono text-muted opacity-60 flex-shrink-0">{ev.time_et}</span>}
    </div>
  );
}

export function EconCalendar({ days = 7, max = 6 }: { days?: number; max?: number }) {
  const { data } = useCalendar(days);
  const today = data?.today ?? "";
  const events = (data?.events ?? []).slice(0, max);

  return (
    <div className="border-t border-line">
      <div className="h-[24px] flex items-center px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
          What&rsquo;s Next
        </span>
      </div>
      {events.length === 0
        ? <p className="px-3 py-1 text-[10px] font-mono text-muted opacity-60">no events scheduled</p>
        : events.map((ev, i) => <Row key={`${ev.event}-${ev.date}-${i}`} ev={ev} today={today} />)}
    </div>
  );
}
