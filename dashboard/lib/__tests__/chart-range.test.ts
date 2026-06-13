import { describe, expect, it } from "vitest";
import { visibleRangeFor } from "../chart-range";

const ts = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("visibleRangeFor", () => {
  const first = ts("2024-06-12T00:00:00Z");
  const last = ts("2026-06-11T00:00:00Z");

  it("3M window ends at last bar and starts ~3 months back", () => {
    const r = visibleRangeFor("3M", first, last);
    expect(r.to).toBe(last);
    expect(r.from).toBe(ts("2026-03-11T00:00:00Z"));
  });

  it("2Y clamps to first available bar", () => {
    const r = visibleRangeFor("2Y", first, last);
    expect(r.from).toBe(first); // exactly 2y of data — clamped, not before history
  });

  it("clamps when history is shorter than the period", () => {
    const shortFirst = ts("2026-04-01T00:00:00Z");
    const r = visibleRangeFor("1Y", shortFirst, last);
    expect(r.from).toBe(shortFirst);
  });

  it("6M from a 31st clamps to month-end, no rollover", () => {
    const r = visibleRangeFor("6M", first, ts("2026-05-31T00:00:00Z"));
    expect(r.from).toBe(ts("2025-11-30T00:00:00Z"));
  });
});
