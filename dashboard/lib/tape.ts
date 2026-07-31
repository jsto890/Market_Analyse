/**
 * Layout maths for Today's tape — everything scheduled to move today on one
 * 04:00–20:00 ET axis. Kept out of the component so the lane packing is
 * testable without a DOM: percentage-positioned labels overlap the moment two
 * releases share a slot, and 08:30 is the only time the macro feed ever uses.
 */

export const TAPE_START_MIN = 4 * 60; // 04:00 ET — pre-market opens
export const TAPE_END_MIN = 20 * 60; // 20:00 ET — after-hours closes
export const TAPE_SPAN_MIN = TAPE_END_MIN - TAPE_START_MIN;

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

/** 510 → "08:30". */
export function fmtEtClock(minutes: number): string {
  const hh = Math.floor(minutes / 60) % 24;
  const mm = Math.round(minutes) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Wall-clock minutes in US Eastern, whatever zone the viewer is in. */
export function nowEtMinutes(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hh * 60 + mm;
}

/** Position along the axis as 0..1, clamped so an 03:00 print still renders. */
export function tapeFraction(minutes: number): number {
  const f = (minutes - TAPE_START_MIN) / TAPE_SPAN_MIN;
  return Math.min(1, Math.max(0, f));
}

/** True once the axis has run past `minutes` — the now-marker is only on the
 *  axis during the session, and a marker pinned to 04:00 all evening lies. */
export function nowOnAxis(minutes: number): boolean {
  return minutes >= TAPE_START_MIN && minutes <= TAPE_END_MIN;
}

/**
 * How much axis a label eats, expressed in minutes so collision is pure
 * arithmetic. ~5 minutes per 11px glyph on a 960-minute axis, plus the clock
 * prefix and the gutter to the next label.
 */
const MIN_PER_CHAR = 5;
const LABEL_PAD_MIN = 34;

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
