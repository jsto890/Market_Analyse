/**
 * Layout maths for Today's tape — everything scheduled to move the next 24
 * hours, on one rolling axis. Kept out of the component so the window and the
 * lane packing are testable without a DOM: percentage-positioned labels overlap
 * the moment two releases share a slot, and 08:30 is the only time the macro
 * feed ever uses.
 */

export const TAPE_START_MIN = 4 * 60; // 04:00 ET — pre-market opens
export const TAPE_END_MIN = 20 * 60; // 20:00 ET — after-hours closes

export interface TapeSession {
  key: string;
  label: string;
  startMin: number;
  endMin: number;
}

export const TAPE_SESSIONS: TapeSession[] = [
  { key: "pre", label: "Pre", startMin: TAPE_START_MIN, endMin: 9 * 60 + 30 },
  { key: "regular", label: "Regular", startMin: 9 * 60 + 30, endMin: 16 * 60 },
  { key: "after", label: "After", startMin: 16 * 60, endMin: TAPE_END_MIN },
];

/** "08:30" → 510. Null for anything that isn't a clock time. */
export function etMinutes(timeEt: string | null | undefined): number | null {
  if (!timeEt) return null;
  const [hh, mm] = timeEt.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Where the tape runs. The session boundaries are facts about this exchange
 *  and never move. */
export const TAPE_TZ = "America/New_York";
/** Where it is read. Only the printed clock moves. */
export const LOCAL_TZ = "Australia/Sydney";

/* ── Rolling 24-hour window ─────────────────────────────────────────────────
 *
 * The tape used to be a fixed 04:00–20:00 ET axis, which meant it had nothing
 * to draw on any day the calendar was empty — most days, since the macro seed
 * carries seven recurring releases. The window below instead follows the clock:
 * it starts two hours behind the current hour and runs 24 hours forward, so it
 * always spans a session boundary and always has somewhere to put "now".
 */

export const HOUR_MS = 3_600_000;
/** Hours of already-happened tape kept on screen, so the now-marker is never
 *  pinned to the left edge and a release you just missed is still visible. */
export const TAPE_LOOKBACK_H = 2;
export const TAPE_SPAN_H = 24;

export interface TapeWindow {
  startMs: number;
  endMs: number;
}

/** Offset between UTC and `tz` at a given instant, in ms. Read off Intl rather
 *  than a table, so it follows daylight saving in both hemispheres. */
function tzOffsetMs(atMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUtc - atMs;
}

/**
 * Epoch ms for a wall-clock reading in `tz`. Inverting a zone offset is
 * circular — the offset depends on the instant you are solving for — so this
 * guesses with the offset at the naive instant and then corrects once, which
 * resolves everything except the hour that daylight saving skips.
 */
export function zonedMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = naive - tzOffsetMs(naive, tz);
  return naive - tzOffsetMs(firstPass, tz);
}

/** Epoch ms for a calendar row. Rows without a clock have no axis position —
 *  they are listed off-axis instead of being guessed onto midnight. */
export function eventMs(date: string, timeEt: string | null | undefined): number | null {
  const minutes = etMinutes(timeEt);
  if (minutes === null) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return zonedMs(y, m, d, Math.floor(minutes / 60), minutes % 60, TAPE_TZ);
}

/** The window on screen. Snapped to the hour so it advances in visible steps
 *  rather than creeping every render, and so two renders a minute apart agree. */
export function tapeWindow(at: Date = new Date()): TapeWindow {
  const startMs = Math.floor(at.getTime() / HOUR_MS) * HOUR_MS - TAPE_LOOKBACK_H * HOUR_MS;
  return { startMs, endMs: startMs + TAPE_SPAN_H * HOUR_MS };
}

/** Position along the window as 0..1. Null for anything outside it, so callers
 *  drop off-window events rather than stacking them on an edge. */
export function windowFraction(ms: number, win: TapeWindow): number | null {
  if (ms < win.startMs || ms > win.endMs) return null;
  return (ms - win.startMs) / (win.endMs - win.startMs);
}

export interface WindowSession {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
}

/** Session bands intersecting the window, clipped to it. A 24-hour window spans
 *  two ET dates, so the same label can appear twice — the key carries the date
 *  to keep them distinct. */
export function windowSessions(win: TapeWindow): WindowSession[] {
  const out: WindowSession[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAPE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const seen = new Set<string>();
  // Walk a day either side: the window's edges can land mid-session on a date
  // that neither edge formats to. Two probes 24h apart can still land on the
  // same ET date across a DST change, hence the guard — a repeated date is a
  // duplicate band with a duplicate React key.
  for (let offset = -1; offset <= 1; offset++) {
    const parts = fmt.format(new Date(win.startMs + offset * 24 * HOUR_MS));
    if (seen.has(parts)) continue;
    seen.add(parts);
    const [y, m, d] = parts.split("-").map(Number);
    for (const s of TAPE_SESSIONS) {
      const startMs = zonedMs(y, m, d, Math.floor(s.startMin / 60), s.startMin % 60, TAPE_TZ);
      const endMs = zonedMs(y, m, d, Math.floor(s.endMin / 60), s.endMin % 60, TAPE_TZ);
      const clippedStart = Math.max(startMs, win.startMs);
      const clippedEnd = Math.min(endMs, win.endMs);
      if (clippedEnd > clippedStart) {
        out.push({ key: `${parts}:${s.key}`, label: s.label, startMs: clippedStart, endMs: clippedEnd });
      }
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Hour marks for the axis, every `everyH` hours, on the hour in local time. */
export function windowTicks(win: TapeWindow, everyH = 4): number[] {
  const out: number[] = [];
  const step = everyH * HOUR_MS;
  for (let ms = Math.ceil(win.startMs / step) * step; ms <= win.endMs; ms += step) {
    out.push(ms);
  }
  return out;
}

/** The ET calendar dates the window touches, as YYYY-MM-DD. A 24-hour window
 *  always spans two of them, which is how an untimed row knows whether it
 *  belongs to this band or to the calendar page. */
export function windowDates(win: TapeWindow): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAPE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const out: string[] = [];
  for (let ms = win.startMs; ms <= win.endMs; ms += 12 * HOUR_MS) {
    const d = fmt.format(new Date(ms));
    if (!out.includes(d)) out.push(d);
  }
  const last = fmt.format(new Date(win.endMs));
  if (!out.includes(last)) out.push(last);
  return out;
}

/** Whole local calendar days between `fromMs` and `ms`. The `+1` on a reading:
 *  over a 24-hour window the printed clock wraps, and "06:00" to the right of
 *  "23:30" reads as the tape running backwards without it. */
export function localDayShift(ms: number, fromMs: number, tz: string = LOCAL_TZ): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (at: number) => {
    const [y, m, d] = fmt.format(new Date(at)).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((day(ms) - day(fromMs)) / 86_400_000);
}

/** An instant printed on the reader's clock. */
export function fmtLocalTime(ms: number, tz: string = LOCAL_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/**
 * How much axis a label eats, expressed in minutes so collision is pure
 * arithmetic: ~11px per glyph, plus the clock prefix and the gutter to the next
 * label. The minute figures scale with the window — the same 100px label spans
 * half again as many minutes now the axis carries 1440 of them rather than the
 * old 960.
 */
const MIN_PER_CHAR = 7.5;
const LABEL_PAD_MIN = 51;

export function labelSpanMin(label: string): number {
  return LABEL_PAD_MIN + label.length * MIN_PER_CHAR;
}

/**
 * Greedy lane packing: each item takes the topmost lane whose previous label
 * has already ended. Two 08:30 releases land in lanes 0 and 1 rather than on
 * top of each other, and a lone 16:00 print stays in lane 0.
 */
export function assignLanes<T extends { minutes: number; label: string }>(
  items: T[]
): (T & { lane: number })[] {
  const laneEnd: number[] = [];
  return [...items]
    .sort((a, b) => a.minutes - b.minutes || a.label.localeCompare(b.label))
    .map((item) => {
      let lane = laneEnd.findIndex((end) => end <= item.minutes);
      if (lane === -1) {
        lane = laneEnd.length;
        laneEnd.push(0);
      }
      laneEnd[lane] = item.minutes + labelSpanMin(item.label);
      return { ...item, lane };
    });
}

/** Lanes needed to draw `items` — 0 when there is nothing to draw. */
export function laneCount(items: { lane: number }[]): number {
  return items.reduce((n, i) => Math.max(n, i.lane + 1), 0);
}
