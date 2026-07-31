import { describe, it, expect } from "vitest";
import { weeklyTrail, buildTrails, type TrailHistory } from "@/lib/rotationTrails";

/** Mondays through Fridays across three weeks of daily runs. */
const history: TrailHistory = {
  "2026-07-20": { Energy: [99, 98], Utilities: [101, 101] },
  "2026-07-24": { Energy: [100, 99], Utilities: [101, 100] },
  "2026-07-27": { Energy: [101, 100] },
  "2026-07-31": { Energy: [102, 101], Utilities: [100, 99] },
  "2026-08-03": { Energy: [103, 102] },
};

describe("weeklyTrail", () => {
  it("keeps one point a week — the last run of that week", () => {
    expect(weeklyTrail(history, "Energy")).toEqual([
      { date: "2026-07-24", rs_ratio: 100, rs_mom: 99 },
      { date: "2026-07-31", rs_ratio: 102, rs_mom: 101 },
      { date: "2026-08-03", rs_ratio: 103, rs_mom: 102 },
    ]);
  });

  it("skips the weeks a sector was not recorded in", () => {
    // Utilities is absent from the 27th and the 3rd; the weeks it does appear
    // in still each contribute their last run.
    expect(weeklyTrail(history, "Utilities").map((p) => p.date)).toEqual([
      "2026-07-24",
      "2026-07-31",
    ]);
  });

  it("draws nothing from a single week", () => {
    expect(weeklyTrail({ "2026-08-01": { Energy: [100, 100] } }, "Energy")).toEqual([]);
  });

  it("draws nothing for a sector with no history, or with no file at all", () => {
    expect(weeklyTrail(history, "Uranium")).toEqual([]);
    expect(weeklyTrail(undefined, "Energy")).toEqual([]);
  });

  it("keeps the most recent weeks when the history outruns the window", () => {
    const long: TrailHistory = {};
    for (let w = 0; w < 12; w++) {
      const d = new Date(Date.UTC(2026, 4, 4 + w * 7));
      long[d.toISOString().slice(0, 10)] = { Energy: [100 + w, 100] };
    }
    const trail = weeklyTrail(long, "Energy", 8);
    expect(trail).toHaveLength(8);
    expect(trail[0].rs_ratio).toBe(104);
    expect(trail[7].rs_ratio).toBe(111);
  });
});

describe("buildTrails", () => {
  it("omits the sectors with nothing to draw rather than keying them to []", () => {
    const built = buildTrails(history, ["Energy", "Utilities", "Uranium"]);
    expect(Object.keys(built)).toEqual(["Energy", "Utilities"]);
  });
});
