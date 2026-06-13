import { describe, expect, it } from "vitest";
import { forexSessions } from "../forex-session";

// Sessions in UTC (standard FX convention): Asia ~00–09, London ~07–16, NY ~12–21.
describe("forexSessions", () => {
  it("London+NY overlap early afternoon UTC", () => {
    const s = forexSessions(new Date("2026-06-12T14:00:00Z")); // Fri
    expect(s.active).toContain("LDN");
    expect(s.active).toContain("NY");
    expect(s.overlap).toBe(true);
  });
  it("Asia only, early UTC", () => {
    const s = forexSessions(new Date("2026-06-12T02:00:00Z"));
    expect(s.active).toEqual(["ASIA"]);
    expect(s.overlap).toBe(false);
  });
  it("weekend closed", () => {
    const s = forexSessions(new Date("2026-06-13T14:00:00Z")); // Sat
    expect(s.active).toEqual([]);
    expect(s.closed).toBe(true);
  });
});
