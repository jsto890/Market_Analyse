import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calledSince } from "../called-since";

describe("calledSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("formats date, days and pct", () => {
    const r = calledSince("2026-05-21", 42.1, 48.77);
    expect(r).not.toBeNull();
    expect(r!.days).toBe(22);
    expect(r!.pct).toBeCloseTo(15.84, 1);
    expect(r!.dateLabel).toBe("21 May");
  });

  it("null pct when entry missing", () => {
    const r = calledSince("2026-05-21", null, 48.77);
    expect(r!.pct).toBeNull();
  });

  it("null on garbage date", () => {
    expect(calledSince("not-a-date", 1, 2)).toBeNull();
  });
});
