import { describe, it, expect } from "vitest";
import {
  HOUR_MS,
  TAPE_LOOKBACK_H,
  TAPE_SPAN_H,
  assignLanes,
  etMinutes,
  eventMs,
  fmtLocalTime,
  laneCount,
  localDayShift,
  tapeWindow,
  windowDates,
  windowFraction,
  windowSessions,
  windowTicks,
  zonedMs,
} from "@/lib/tape";

describe("etMinutes", () => {
  it("reads the feed's clock strings", () => {
    expect(etMinutes("08:30")).toBe(510);
    expect(etMinutes("00:00")).toBe(0);
    expect(etMinutes("16:00")).toBe(960);
  });

  it("returns null for anything that isn't a clock time", () => {
    expect(etMinutes(null)).toBeNull();
    expect(etMinutes(undefined)).toBeNull();
    expect(etMinutes("")).toBeNull();
    expect(etMinutes("BMO")).toBeNull();
    expect(etMinutes("25:00")).toBeNull();
    expect(etMinutes("08:75")).toBeNull();
  });
});

describe("zonedMs", () => {
  it("resolves a New York wall clock to the right instant on EDT", () => {
    // 2026-08-03 08:30 in New York is UTC-4 → 12:30Z.
    expect(zonedMs(2026, 8, 3, 8, 30, "America/New_York")).toBe(
      Date.parse("2026-08-03T12:30:00Z"),
    );
  });

  it("follows the offset across the DST boundary rather than assuming one", () => {
    // January is EST (UTC-5). A fixed -4 would land this an hour early.
    expect(zonedMs(2026, 1, 15, 8, 30, "America/New_York")).toBe(
      Date.parse("2026-01-15T13:30:00Z"),
    );
  });
});

describe("eventMs", () => {
  it("places a dated, timed release on the absolute timeline", () => {
    expect(eventMs("2026-08-03", "08:30")).toBe(Date.parse("2026-08-03T12:30:00Z"));
  });

  it("gives a row with no clock no position at all", () => {
    // Guessing midnight would drop every date-only earnings row onto the axis
    // hours before the pre-market open.
    expect(eventMs("2026-08-03", null)).toBeNull();
    expect(eventMs("2026-08-03", "BMO")).toBeNull();
    expect(eventMs("not-a-date", "08:30")).toBeNull();
  });
});

describe("tapeWindow", () => {
  it("starts two hours back, on the hour, and runs 24 forward", () => {
    const win = tapeWindow(new Date("2026-08-03T12:37:41Z"));
    expect(win.startMs).toBe(Date.parse("2026-08-03T10:00:00Z"));
    expect(win.endMs - win.startMs).toBe(TAPE_SPAN_H * HOUR_MS);
    expect(win.endMs).toBe(Date.parse("2026-08-04T10:00:00Z"));
  });

  it("holds still within the hour, then steps", () => {
    // The whole point of snapping: the window must not creep on every render,
    // or two components a second apart disagree about where "now" sits.
    const a = tapeWindow(new Date("2026-08-03T12:00:00Z"));
    const b = tapeWindow(new Date("2026-08-03T12:59:59Z"));
    const c = tapeWindow(new Date("2026-08-03T13:00:00Z"));
    expect(b.startMs).toBe(a.startMs);
    expect(c.startMs - a.startMs).toBe(HOUR_MS);
  });

  it("always has now on the axis, never against an edge", () => {
    const at = new Date("2026-08-03T12:37:00Z");
    const f = windowFraction(at.getTime(), tapeWindow(at));
    expect(f).not.toBeNull();
    expect(f).toBeCloseTo((TAPE_LOOKBACK_H + 37 / 60) / TAPE_SPAN_H, 6);
  });
});

describe("windowFraction", () => {
  const win = tapeWindow(new Date("2026-08-03T12:00:00Z")); // 10:00Z → 10:00Z+1

  it("maps the edges to 0 and 1", () => {
    expect(windowFraction(win.startMs, win)).toBe(0);
    expect(windowFraction(win.endMs, win)).toBe(1);
    expect(windowFraction(win.startMs + 12 * HOUR_MS, win)).toBeCloseTo(0.5, 6);
  });

  it("drops anything off-window rather than clamping it to an edge", () => {
    // Clamping stacked every out-of-range release on 0% — three prints from
    // yesterday reading as three prints at the start of the window.
    expect(windowFraction(win.startMs - 1, win)).toBeNull();
    expect(windowFraction(win.endMs + 1, win)).toBeNull();
  });
});

describe("windowSessions", () => {
  const win = tapeWindow(new Date("2026-08-03T12:00:00Z")); // 06:00 ET Mon → 06:00 ET Tue

  it("carries the sessions of both ET dates the window touches", () => {
    const sessions = windowSessions(win);
    expect(sessions.map((s) => s.label)).toEqual([
      "Pre",
      "Regular",
      "After",
      "Pre",
    ]);
    // Same label twice, so the key has to disambiguate or React collapses them.
    expect(new Set(sessions.map((s) => s.key)).size).toBe(sessions.length);
  });

  it("clips the session the window opens inside instead of starting it early", () => {
    const [pre] = windowSessions(win);
    // 04:00 ET Pre already ran two hours before this window opened.
    expect(pre.startMs).toBe(win.startMs);
    expect(pre.endMs).toBe(zonedMs(2026, 8, 3, 9, 30, "America/New_York"));
  });

  it("keeps every band inside the window", () => {
    for (const s of windowSessions(win)) {
      expect(s.startMs).toBeGreaterThanOrEqual(win.startMs);
      expect(s.endMs).toBeLessThanOrEqual(win.endMs);
      expect(s.endMs).toBeGreaterThan(s.startMs);
    }
  });

  it("still finds the session a window opens in the middle of the night", () => {
    // 02:00 ET: the window opens in the overnight gap, so its own date's Pre
    // starts later and the previous date's After has already closed.
    const overnight = tapeWindow(new Date("2026-08-04T06:00:00Z"));
    const labels = windowSessions(overnight).map((s) => s.label);
    expect(labels).toEqual(["Pre", "Regular", "After"]);
  });
});

describe("windowDates", () => {
  it("names both ET dates the window covers", () => {
    expect(windowDates(tapeWindow(new Date("2026-08-03T12:00:00Z")))).toEqual([
      "2026-08-03",
      "2026-08-04",
    ]);
  });
});

describe("windowTicks", () => {
  const win = tapeWindow(new Date("2026-08-03T12:00:00Z"));

  it("puts a mark on the hour every four hours, all inside the window", () => {
    const ticks = windowTicks(win);
    expect(ticks.length).toBeGreaterThanOrEqual(6);
    for (const t of ticks) {
      expect(t % (4 * HOUR_MS)).toBe(0);
      expect(t).toBeGreaterThanOrEqual(win.startMs);
      expect(t).toBeLessThanOrEqual(win.endMs);
    }
  });
});

describe("fmtLocalTime / localDayShift", () => {
  it("prints the reader's clock, not New York's", () => {
    // 2026-08-03T12:30:00Z is 08:30 in New York and 22:30 in Sydney.
    expect(fmtLocalTime(Date.parse("2026-08-03T12:30:00Z"))).toBe("22:30");
  });

  it("flags the reading that has rolled into tomorrow here", () => {
    const from = Date.parse("2026-08-03T12:30:00Z"); // 22:30 Sydney
    expect(localDayShift(from, from)).toBe(0);
    // +8h → 06:30 Sydney the next day. Printed bare it reads as going backwards.
    expect(localDayShift(from + 8 * HOUR_MS, from)).toBe(1);
    expect(fmtLocalTime(from + 8 * HOUR_MS)).toBe("06:30");
  });
});

describe("assignLanes", () => {
  it("stacks an 08:30 cluster instead of overlapping it", () => {
    // The feed carries PPI and Initial Jobless Claims at the same 08:30.
    const lanes = assignLanes([
      { minutes: 510, label: "PPI" },
      { minutes: 510, label: "Jobless claims" },
    ]);
    expect(lanes.map((l) => l.lane).sort()).toEqual([0, 1]);
    expect(laneCount(lanes)).toBe(2);
  });

  it("keeps well-separated releases on one lane", () => {
    const lanes = assignLanes([
      { minutes: 510, label: "CPI" },
      { minutes: 960, label: "Fed minutes" },
    ]);
    expect(lanes.every((l) => l.lane === 0)).toBe(true);
    expect(laneCount(lanes)).toBe(1);
  });

  it("frees a lane again once its label has ended", () => {
    const lanes = assignLanes([
      { minutes: 510, label: "PPI" },
      { minutes: 510, label: "Jobless claims" },
      { minutes: 900, label: "Fed speakers" },
    ]);
    expect(lanes.find((l) => l.minutes === 900)?.lane).toBe(0);
    expect(laneCount(lanes)).toBe(2);
  });

  it("sorts by clock whatever order the feed sent", () => {
    const lanes = assignLanes([
      { minutes: 960, label: "Fed minutes" },
      { minutes: 510, label: "CPI" },
    ]);
    expect(lanes.map((l) => l.label)).toEqual(["CPI", "Fed minutes"]);
    expect(laneCount([])).toBe(0);
  });
});
