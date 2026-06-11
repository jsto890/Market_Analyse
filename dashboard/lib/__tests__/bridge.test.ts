import { describe, it, expect } from "vitest";
import { resolveBridgePath } from "@/lib/bridge";
describe("resolveBridgePath", () => {
  it("uses BRIDGE_DIR when set", () => {
    expect(resolveBridgePath("/x")).toBe("/x/bridge_latest.csv");
  });
  it("defaults to ../reports", () => {
    expect(resolveBridgePath(undefined)).toMatch(/reports\/bridge_latest\.csv$/);
  });
});
