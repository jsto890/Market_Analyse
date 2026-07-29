import { describe, it, expect } from "vitest";
import { QUADRANT_COLOR, deriveQuadrant, abbreviate, splitDegenerate, computeLabelCollisions, rotationSummary } from "@/lib/rotation";
import type { RotationRow } from "@/components/today/RotationPanel";

describe("QUADRANT_COLOR", () => {
  it("has exactly the four JdK RRG quadrants, token-referenced", () => {
    expect(QUADRANT_COLOR).toEqual({
      leading: "var(--green)",
      improving: "var(--teal)",
      weakening: "var(--amber)",
      lagging: "var(--red)",
    });
  });
});

describe("deriveQuadrant", () => {
  it("trusts an explicit known quadrant field", () => {
    expect(deriveQuadrant({ quadrant: "leading", rs_ratio: 50, rs_mom: 50 })).toBe("leading");
  });
  it("derives from RS-Ratio/RS-Mom when quadrant is unknown", () => {
    expect(deriveQuadrant({ quadrant: "", rs_ratio: 101, rs_mom: 101 })).toBe("leading");
    expect(deriveQuadrant({ quadrant: "", rs_ratio: 99, rs_mom: 101 })).toBe("improving");
    expect(deriveQuadrant({ quadrant: "", rs_ratio: 101, rs_mom: 99 })).toBe("weakening");
    expect(deriveQuadrant({ quadrant: "", rs_ratio: 99, rs_mom: 99 })).toBe("lagging");
  });
});

describe("abbreviate", () => {
  it("passes short names through", () => {
    expect(abbreviate("Energy")).toBe("Energy");
  });
  it("truncates with an ellipsis at the max length", () => {
    expect(abbreviate("Semiconductors & Equip", 10)).toBe("Semicondu…");
  });
});

describe("splitDegenerate", () => {
  it("separates flat 100/100 rows from real ones, and names them (RO-06)", () => {
    const rows = [
      { industry: "Energy", rs_ratio: 105, rs_mom: 98 },
      { industry: "Utilities", rs_ratio: 100.01, rs_mom: 99.98 },
      { industry: "Telecom", rs_ratio: 92, rs_mom: 110 },
    ];
    const { plotted, hidden } = splitDegenerate(rows);
    expect(plotted.map((r) => r.industry)).toEqual(["Energy", "Telecom"]);
    expect(hidden.map((r) => r.industry)).toEqual(["Utilities"]);
  });
});

describe("computeLabelCollisions", () => {
  it("flags points within the threshold of a neighbour, leaves isolated points unflagged", () => {
    const points = [
      { rs_ratio: 100, rs_mom: 100 },
      { rs_ratio: 100.5, rs_mom: 100.5 }, // ~0.7 units from point 0 -> collides
      { rs_ratio: 130, rs_mom: 70 }, // far from everything -> isolated
    ];
    expect(computeLabelCollisions(points, 1.5)).toEqual([true, true, false]);
  });
  it("returns all-false for a single point", () => {
    expect(computeLabelCollisions([{ rs_ratio: 100, rs_mom: 100 }])).toEqual([false]);
  });
});

function row(overrides: Partial<RotationRow>): RotationRow {
  return {
    industry: "Semiconductors", quadrant: "leading", rs_ratio: 102, rs_mom: 101,
    breadth: 60, n: 12, r1w: 1.2, r1m: 3.4, r3m: 8.1, rank: 1, drank: 0,
    ...overrides,
  };
}

describe("rotationSummary (TD-13)", () => {
  it("lists up to two leading industries by rank and the fading fraction", () => {
    const rows = [
      row({ industry: "Semiconductors", quadrant: "leading", rank: 1 }),
      row({ industry: "Energy", quadrant: "leading", rank: 2 }),
      row({ industry: "Materials", quadrant: "leading", rank: 3 }),
      row({ industry: "Retail", quadrant: "weakening", rank: 4 }),
      row({ industry: "Utilities", quadrant: "lagging", rank: 5 }),
    ];
    expect(rotationSummary(rows)).toBe("Leading: Semiconductors, Energy · 2/5 fading");
  });

  it("shows 'Leading: none' when no industry is in the leading quadrant", () => {
    const rows = [row({ industry: "Retail", quadrant: "weakening", rank: 1 })];
    expect(rotationSummary(rows)).toBe("Leading: none · 1/1 fading");
  });

  it("handles an empty rotation list", () => {
    expect(rotationSummary([])).toBe("Leading: none · 0/0 fading");
  });
});
