import { describe, it, expect } from "vitest";
import { byMovement, toneClass, type MacroTile } from "@/lib/macro";

function tile(scope: string, delta_1d: number | null, delta_1h: number | null = null): MacroTile {
  return { scope, score: 0, n: 1, ts: "", delta_1d, delta_1h, spark: [] };
}

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

describe("byMovement (MAC-07)", () => {
  it("orders sectors by how far they moved, in either direction", () => {
    const out = byMovement([
      tile("sector:Energy", 0.02),
      tile("sector:Financials", -0.31),
      tile("sector:AI / Compute", 0.14),
    ]);
    expect(out.map((t) => t.scope)).toEqual([
      "sector:Financials",
      "sector:AI / Compute",
      "sector:Energy",
    ]);
  });

  it("keeps GLOBAL then US above the sectors however little they moved", () => {
    const out = byMovement([
      tile("sector:Energy", 0.4),
      tile("us", 0.0),
      tile("global", 0.0),
    ]);
    expect(out.map((t) => t.scope)).toEqual(["global", "us", "sector:Energy"]);
  });

  it("falls back to the 1h change when the store has no day-old point", () => {
    const out = byMovement([tile("sector:A", null, 0.01), tile("sector:B", null, 0.2)]);
    expect(out.map((t) => t.scope)).toEqual(["sector:B", "sector:A"]);
  });

  it("breaks ties by name so the grid does not reshuffle between polls", () => {
    const out = byMovement([tile("sector:Zinc", 0.1), tile("sector:Autos", 0.1)]);
    expect(out.map((t) => t.scope)).toEqual(["sector:Autos", "sector:Zinc"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [tile("sector:A", 0.01), tile("global", 0)];
    byMovement(input);
    expect(input.map((t) => t.scope)).toEqual(["sector:A", "global"]);
  });
});
