import { describe, expect, it } from "vitest";
import { usMarketState } from "../market-clock";

// June dates = EDT (UTC-4); January dates = EST (UTC-5)
describe("usMarketState", () => {
  it("regular hours (June, 10:30 ET)", () =>
    expect(usMarketState(new Date("2026-06-12T14:30:00Z"))).toBe("regular"));
  it("pre-market (June, 05:00 ET)", () =>
    expect(usMarketState(new Date("2026-06-12T09:00:00Z"))).toBe("pre"));
  it("after-hours (June, 17:00 ET)", () =>
    expect(usMarketState(new Date("2026-06-12T21:00:00Z"))).toBe("after"));
  it("overnight closed (June, 23:00 ET)", () =>
    expect(usMarketState(new Date("2026-06-13T03:00:00Z"))).toBe("closed"));
  it("weekend closed (Saturday June 13 ET)", () =>
    expect(usMarketState(new Date("2026-06-13T15:00:00Z"))).toBe("closed"));
  it("EST handled (January, 10:30 ET = 15:30Z)", () =>
    expect(usMarketState(new Date("2026-01-13T15:30:00Z"))).toBe("regular"));
});
