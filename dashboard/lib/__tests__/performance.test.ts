import { describe, it, expect } from "vitest";
import { perfStats } from "@/lib/performance";

const rows = [
  { ticker: "A", first_said: "2026-05-08", entry: 10, peak: 15, "peak_gain_%": 50, days_to_peak: 5 },
  { ticker: "B", first_said: "2026-05-09", entry: 10, peak: 11, "peak_gain_%": 10, days_to_peak: 0 },
  { ticker: "C", first_said: "2026-06-10", entry: 10, peak: 10.5, "peak_gain_%": 5, days_to_peak: 1 },
] as any;

const s = perfStats(rows, new Date("2026-06-11"));

describe("perfStats", () => {
  it("uses median as headline", () => expect(s.medianPeak).toBe(10));

  it("excludes young picks from conversion denominators (≥10 trading days)", () =>
    expect(s.reached10.eligible).toBe(2)); // C is 1 day old → excluded

  it("reports day-0 peaks separately and excludes from days-to-peak median", () => {
    expect(s.day0Count).toBe(1);
    expect(s.medianDaysToPeak).toBe(5);
  });
});
