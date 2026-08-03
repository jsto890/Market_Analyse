import { describe, it, expect } from "vitest";
import { statusMessage } from "@/lib/todayStatus";

describe("statusMessage — single severity-ranked status region (TD-12)", () => {
  it("ranks 'no data' above 'stale' when both are true", () => {
    const status = statusMessage({
      rows: [],
      stale: true,
      generatedAt: "2020-01-01T00:00:00Z",
    });
    expect(status).toEqual({
      level: "error",
      text: "No bridge data — run_daily may have failed",
    });
  });

  it("falls back to the stale message when data exists but is old", () => {
    const status = statusMessage({
      rows: [{ ticker: "NVDA" }] as any,
      stale: true,
      generatedAt: "2020-01-01T00:00:00Z",
    });
    expect(status?.level).toBe("warn");
    expect(status?.text).toMatch(/stale/);
  });

  it("returns null when neither condition holds", () => {
    expect(
      statusMessage({ rows: [{ ticker: "NVDA" }] as any, stale: false, generatedAt: null })
    ).toBeNull();
  });
});
