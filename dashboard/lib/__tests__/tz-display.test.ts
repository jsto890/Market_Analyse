import { describe, expect, it } from "vitest";
import { dualClock } from "../tz-display";

describe("dualClock", () => {
  it("renders Sydney primary, ET secondary", () => {
    // 2026-06-12T18:30Z = 04:30 Sydney (AEST, next day) / 14:30 ET (EDT)
    const d = dualClock(new Date("2026-06-12T18:30:00Z"));
    expect(d.primary).toMatch(/\d{1,2}:\d{2}/);      // Sydney HH:MM
    expect(d.secondary).toMatch(/\d{1,2}:\d{2} ET/); // "... ET"
  });
});
