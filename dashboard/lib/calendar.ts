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

/**
 * The rank as a two- or three-letter code, so importance survives in a 26px
 * column. Paired with `IMPORTANCE_LABEL` for the accessible name — the code is
 * a glyph, and "TOP" read aloud is not a rank.
 */
export const IMPORTANCE_RANK: Record<string, string> = {
  high: "TOP",
  medium: "MID",
  low: "LOW",
};

/** Tone for the importance rank — bare text, no box. A border and a fill around
 *  a three-letter code is furniture repeated on every row of a 28-row day; the
 *  colour alone carries the tier (MAC-04). */
export function importanceChipClass(importance: string): string {
  if (importance === "high") return "text-neg";
  if (importance === "medium") return "text-warn";
  return "text-muted";
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

/**
 * This week / Next week / Later this month. The plain week grouping ran to five
 * or six headings over a 30-day horizon and eight over 60, which is a list of
 * weeks rather than a spine you can find "soon" in.
 */
export function groupBySpine(events: CalEvent[], today: string): CalWeek[] {
  const weeks = groupByWeek(events, today);
  const near = weeks.filter((w) => w.label === "This week" || w.label === "Next week");
  const later = weeks.filter((w) => w.label !== "This week" && w.label !== "Next week");
  if (later.length === 0) return near;
  const tail = later.flatMap((w) => w.events);
  // "Later this month" only when it is: at a 60-day horizon the tail runs into
  // the next month, and a heading that says otherwise is simply wrong.
  const sameMonth = tail.every((e) => e.date.slice(0, 7) === today.slice(0, 7));
  return [
    ...near,
    { start: later[0].start, label: sameMonth ? "Later this month" : "Later", events: tail },
  ];
}

/**
 * Before the open, after the close, or in session — the half of an earnings
 * date that decides which session the gap lands in. Null when the feed sends no
 * time, which is currently every row: the Argus earnings seed carries a date
 * only, so callers render nothing at all until a timed feed lands.
 */
export function earningsSession(timeEt: string | null): "BMO" | "AMC" | "intraday" | null {
  if (!timeEt) return null;
  const [hh, mm] = timeEt.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const minutes = hh * 60 + mm;
  if (minutes < 9 * 60 + 30) return "BMO";
  if (minutes >= 16 * 60) return "AMC";
  return "intraday";
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

/** "Fri 31" — the day spine. The month is already on the week heading above it,
 *  so repeating it in every cell prints the same label thirty times.
 *
 *  Weekday and number are composed rather than left to `Intl`: given both parts
 *  a day-first locale returns "31 Fri", which reads as a number and a word. */
export function shortDayLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getDate()}`;
}

/**
 * Trading sessions from `from` (exclusive) to `to` (inclusive). A weekday count:
 * no feed we carry lists market holidays, so this is deliberately the simple
 * version rather than one that pretends to know about Thanksgiving.
 */
export function sessionsUntil(from: string, to: string): number {
  const end = new Date(to + "T00:00:00").getTime();
  const d = new Date(from + "T00:00:00");
  let n = 0;
  while (d.getTime() < end) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return n;
}

function dayMonth(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric", month: "short",
  });
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "28 Jul – 1 Aug · 1 session left" — the span a spine heading covers. A named
 * week is its own Mon–Fri whether or not every day of it has an event; the
 * collapsed tail runs from its first event to its last, because it is not a week.
 */
export function weekRangeLabel(week: CalWeek, today: string): string {
  const tail = week.label.startsWith("Later");
  const dates = week.events.map((e) => e.date).sort();
  const from = tail ? dates[0] ?? week.start : week.start;
  const to = tail ? dates[dates.length - 1] ?? week.start : addDays(week.start, 4);
  const range = `${dayMonth(from)} – ${dayMonth(to)}`;
  if (week.label !== "This week") return range;
  const dow = new Date(today + "T00:00:00").getDay();
  const left = sessionsUntil(today, to) + (dow !== 0 && dow !== 6 ? 1 : 0);
  return left > 0 ? `${range} · ${left} session${left === 1 ? "" : "s"} left` : range;
}
