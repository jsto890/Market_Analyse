import { describe, it, expect } from "vitest";
import { futuresMarketState } from "../market-clock";
import { pickChangeBasis, computePct } from "../change-basis";

// Helper: build a Date at a given ET wall-clock time (July = EDT, UTC-4).
const et = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

describe("futuresMarketState", () => {
  it("open Tuesday mid-session", () => {
    expect(futuresMarketState(et("2026-07-21", "11:00"))).toBe("open");
  });
  it("closed during 17:00-18:00 ET maintenance", () => {
    expect(futuresMarketState(et("2026-07-21", "17:30"))).toBe("closed");
  });
  it("closed Saturday", () => {
    expect(futuresMarketState(et("2026-07-25", "12:00"))).toBe("closed");
  });
  it("closed Sunday before 18:00, open after", () => {
    expect(futuresMarketState(et("2026-07-26", "17:00"))).toBe("closed");
    expect(futuresMarketState(et("2026-07-26", "18:30"))).toBe("open");
  });
  it("closed Friday after 17:00", () => {
    expect(futuresMarketState(et("2026-07-24", "17:30"))).toBe("closed");
  });
  it("open overnight Wednesday 03:00", () => {
    expect(futuresMarketState(et("2026-07-22", "03:00"))).toBe("open");
  });
});

describe("pickChangeBasis", () => {
  it("equities RTH -> session", () => {
    expect(pickChangeBasis({ group: "indices", now: et("2026-07-21", "11:00") })).toBe("session");
  });
  it("equities pre-market -> prev (past-day gain/loss)", () => {
    expect(pickChangeBasis({ group: "indices", now: et("2026-07-21", "08:00") })).toBe("prev");
  });
  it("equities weekend -> prev", () => {
    expect(pickChangeBasis({ group: "indices", now: et("2026-07-25", "12:00") })).toBe("prev");
  });
  it("futures overnight -> session (their market is open)", () => {
    expect(pickChangeBasis({ group: "futures", now: et("2026-07-22", "03:00") })).toBe("session");
  });
  it("futures weekend -> prev", () => {
    expect(pickChangeBasis({ group: "futures", now: et("2026-07-25", "12:00") })).toBe("prev");
  });
  it("forex always session", () => {
    expect(pickChangeBasis({ group: "forex", now: et("2026-07-25", "12:00") })).toBe("session");
  });
});

describe("computePct", () => {
  it("session basis: price vs lastClose", () => {
    expect(computePct(101, 100, 98, "session")).toBeCloseTo(1.0);
  });
  it("prev basis: lastClose vs prevClose", () => {
    expect(computePct(101, 100, 98, "prev")).toBeCloseTo(2.0408, 3);
  });
  it("zero divisor -> 0", () => {
    expect(computePct(101, 0, 0, "session")).toBe(0);
    expect(computePct(101, 100, 0, "prev")).toBe(0);
  });
});
