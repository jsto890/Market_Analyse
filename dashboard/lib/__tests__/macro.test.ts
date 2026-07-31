import { describe, it, expect } from "vitest";
import { toneClass } from "@/lib/macro";

describe("toneClass", () => {
  it("returns the model token above +0.05", () => {
    expect(toneClass(0.2)).toBe("text-model");
  });
  it("returns the model token below -0.05", () => {
    expect(toneClass(-0.2)).toBe("text-model");
  });
  it("returns muted inside the +/-0.05 band", () => {
    expect(toneClass(0)).toBe("text-muted");
  });
});
