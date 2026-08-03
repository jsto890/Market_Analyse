import { describe, it, expect } from "vitest";
import {
  TAPE_END_MIN,
  TAPE_START_MIN,
  assignLanes,
  etMinutes,
  fmtClock,
  localOffsetMin,
  fmtLocalClock,
  laneCount,
  nowEtMinutes,
  nowOnAxis,
  tapeFraction,
} from "@/lib/tape";

describe("etMinutes / fmtClock", () => {
  it("reads the feed's clock strings", () => {
    expect(etMinutes("08:30")).toBe(510);
    expect(etMinutes("00:00")).toBe(0);
    expect(etMinutes("16:00")).toBe(960);
  });

  it("returns null for anything that isn't a clock time", () => {
    // Every earnings row on the feed carries a date and no time.
    expect(etMinutes(null)).toBeNull();
    expect(etMinutes(undefined)).toBeNull();
    expect(etMinutes("")).toBeNull();
    expect(etMinutes("BMO")).toBeNull();
    expect(etMinutes("25:00")).toBeNull();
    expect(etMinutes("08:75")).toBeNull();
  });

  it("round-trips back to the same string", () => {
    expect(fmtClock(510)).toBe("08:30");
    expect(fmtClock(TAPE_START_MIN)).toBe("04:00");
    expect(fmtClock(TAPE_END_MIN)).toBe("20:00");
  });
});

describe("localOffsetMin", () => {
  it("is +14h while New York is on EDT and Sydney on AEST", () => {
    // 2026-08-03: NY = UTC-4, Sydney = UTC+10.
    expect(localOffsetMin(new Date("2026-08-03T12:00:00Z"))).toBe(14 * 60);
  });

  it("is +16h in January, when both sides have swapped", () => {
    // 2026-01-15: NY = UTC-5 (EST), Sydney = UTC+11 (AEDT).
    expect(localOffsetMin(new Date("2026-01-15T12:00:00Z"))).toBe(16 * 60);
  });
});

describe("fmtLocalClock", () => {
  it("prints an ET minute on the Sydney clock", () => {
    expect(fmtLocalClock(4 * 60, 14 * 60)).toEqual({ clock: "18:00", dayShift: 0 });
    expect(fmtLocalClock(9 * 60 + 30, 14 * 60)).toEqual({ clock: "23:30", dayShift: 0 });
  });

  it("flags the roll past midnight rather than printing a time that reads earlier", () => {
    expect(fmtLocalClock(16 * 60, 14 * 60)).toEqual({ clock: "06:00", dayShift: 1 });
    expect(fmtLocalClock(20 * 60, 14 * 60)).toEqual({ clock: "10:00", dayShift: 1 });
  });
});

describe("tapeFraction", () => {
  it("places the session boundaries where the axis draws them", () => {
    expect(tapeFraction(TAPE_START_MIN)).toBe(0);
    expect(tapeFraction(TAPE_END_MIN)).toBe(1);
    expect(tapeFraction(12 * 60)).toBeCloseTo(0.5, 5);
  });

  it("clamps rather than positioning off the axis", () => {
    // A 03:00 print still has to render somewhere.
    expect(tapeFraction(3 * 60)).toBe(0);
    expect(tapeFraction(23 * 60)).toBe(1);
  });
});

describe("nowOnAxis", () => {
  it("is true only inside the drawn window", () => {
    expect(nowOnAxis(TAPE_START_MIN)).toBe(true);
    expect(nowOnAxis(TAPE_END_MIN)).toBe(true);
    expect(nowOnAxis(10 * 60)).toBe(true);
    // A marker pinned to 04:00 all evening lies about where the tape is.
    expect(nowOnAxis(3 * 60 + 59)).toBe(false);
    expect(nowOnAxis(21 * 60)).toBe(false);
  });
});

describe("nowEtMinutes", () => {
  it("reads Eastern wall-clock, not the viewer's zone", () => {
    // 2026-07-31T12:30:00Z is 08:30 EDT.
    expect(nowEtMinutes(new Date("2026-07-31T12:30:00Z"))).toBe(8 * 60 + 30);
  });
});

describe("assignLanes", () => {
  it("stacks the 08:30 cluster instead of overlapping it", () => {
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
      { minutes: 840, label: "Fed speakers" },
    ]);
    expect(lanes.find((l) => l.minutes === 840)?.lane).toBe(0);
    expect(laneCount(lanes)).toBe(2);
  });

  it("orders by time and needs no lanes for nothing", () => {
    const lanes = assignLanes([
      { minutes: 960, label: "Close" },
      { minutes: 510, label: "CPI" },
    ]);
    expect(lanes.map((l) => l.label)).toEqual(["CPI", "Close"]);
    expect(laneCount([])).toBe(0);
  });
});
