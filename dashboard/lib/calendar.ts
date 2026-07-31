"use client";

import useSWR from "swr";
import { visibilityAwareInterval } from "@/lib/swr-visibility";

export interface CalEvent {
  date: string; time_et: string | null; event: string;
  category: string; importance: string; source: string; ticker: string | null;
  // Not produced by the v1 seed (see argus/argus/calendar/schema.py) — rendered
  // only when a future feed supplies them, never faked.
  consensus?: string | null; prior?: string | null; actual?: string | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useCalendar(days = 7) {
  return useSWR<{ today: string; days: number; events: CalEvent[] }>(
    `/api/argus/calendar?days=${days}`, fetcher,
    { refreshInterval: visibilityAwareInterval(300_000), shouldRetryOnError: false }
  );
}

/** "Today" / "Tmrw" / weekday for a YYYY-MM-DD relative to today (local). */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(date + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return "Tmrw";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function importanceMeta(importance: string): { cls: string; label: string } {
  if (importance === "high") return { cls: "w-1.5 h-1.5 rounded-sm bg-warn", label: "High importance" };
  if (importance === "medium") return { cls: "w-1 h-1 rounded-full bg-accent", label: "Medium importance" };
  return { cls: "w-1 h-1 rounded-full border border-muted bg-transparent", label: "Low importance" };
}

/** Text tone for the importance chip — a visible rank, not a hover-only dot (MAC-04). */
export function importanceChipClass(importance: string): string {
  if (importance === "high") return "border-warn/50 bg-warn/10 text-warn";
  if (importance === "medium") return "border-accent/40 bg-accent/10 text-accent";
  return "border-line bg-raised text-muted";
}

/** Offset (ms) between a timezone's wall clock and UTC at a given instant. */
function tzOffsetMs(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const wall = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return wall - at.getTime();
}

/**
 * The instant a `YYYY-MM-DD` + `HH:MM` US-Eastern release lands. One offset
 * correction pass is enough: DST shifts are ±1h and no release is scheduled
 * inside a transition hour.
 */
export function etInstant(date: string, timeEt: string): Date | null {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = timeEt.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(naive - tzOffsetMs("America/New_York", new Date(naive)));
}

/** Release time in the viewer's own zone, e.g. "22:30 AEST". Null when the ET time is unknown. */
export function localTimeLabel(date: string, timeEt: string | null): string | null {
  if (!timeEt) return null;
  const at = etInstant(date, timeEt);
  if (!at) return null;
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(at);
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
  const localDate = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate()
  ).padStart(2, "0")}`;
  if (localDate === date) return `${time}${zone ? ` ${zone}` : ""}`;
  const rolls = localDate > date ? "+1d" : "-1d";
  return `${time}${zone ? ` ${zone}` : ""} (${rolls})`;
}

/** Monday of the ISO week containing `date`, as YYYY-MM-DD. */
export function weekStart(date: string): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  // Local parts, not toISOString() — these are calendar dates, and east-of-UTC
  // viewers would otherwise see every Monday snap back to the Sunday.
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "This week" / "Next week" / "Week of 17 Aug" — the calendar's spine. */
export function weekLabel(weekStartDate: string, today: string): string {
  const diffWeeks = Math.round(
    (new Date(weekStartDate + "T00:00:00").getTime() -
      new Date(weekStart(today) + "T00:00:00").getTime()) / (7 * 86_400_000)
  );
  if (diffWeeks <= 0) return "This week";
  if (diffWeeks === 1) return "Next week";
  return `Week of ${new Date(weekStartDate + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric", month: "short",
  })}`;
}

export interface CalWeek { start: string; label: string; events: CalEvent[] }

/** Chronological events bucketed into weeks, empty weeks dropped. */
export function groupByWeek(events: CalEvent[], today: string): CalWeek[] {
  const buckets = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const key = weekStart(ev.date);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(ev);
    else buckets.set(key, [ev]);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, evs]) => ({ start, label: weekLabel(start, today), events: evs }));
}

export function isEarnings(ev: CalEvent): boolean {
  return ev.category === "earnings" || ev.source === "earnings" || ev.ticker != null;
}

/** Full weekday + date header for a day group, e.g. "Thursday 6 Aug". */
export function fullDayLabel(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "short",
  });
}
