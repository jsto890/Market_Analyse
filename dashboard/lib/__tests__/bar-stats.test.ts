import { describe, expect, it } from "vitest";
import { range52w, volumeVsAvg } from "../bar-stats";

const mkBar = (close: number, volume: number, i: number) => ({
  ts: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  open: close, high: close * 1.01, low: close * 0.99, close, volume,
});

describe("volumeVsAvg", () => {
  it("ratio of last volume vs prior 20-bar average", () => {
    const bars = Array.from({ length: 21 }, (_, i) => mkBar(10, 100, i));
    bars.push(mkBar(10, 250, 21));
    expect(volumeVsAvg(bars)).toBeCloseTo(2.5, 5);
  });
  it("null when too short", () => {
    expect(volumeVsAvg(Array.from({ length: 5 }, (_, i) => mkBar(10, 100, i)))).toBeNull();
  });
});

describe("range52w", () => {
  it("position within window high/low", () => {
    const bars = Array.from({ length: 252 }, (_, i) => mkBar(100 + (i % 50), 100, i));
    const r = range52w(bars);
    expect(r).not.toBeNull();
    expect(r!.pos).toBeGreaterThanOrEqual(0);
    expect(r!.pos).toBeLessThanOrEqual(1);
    expect(r!.hi).toBeGreaterThan(r!.lo);
  });
  it("null when under 60 bars", () => {
    expect(range52w(Array.from({ length: 30 }, (_, i) => mkBar(10, 100, i)))).toBeNull();
  });
});
