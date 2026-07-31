import { describe, it, expect } from "vitest";
import {
  HEADER_GLOSS,
  QUADRANT_LABEL,
  QUADRANT_GLOSS,
  COMBO_POSITION_LABEL,
  COMBO_LETTER_LABEL,
  LADDER_CODE_LABEL,
  GREEK_LABEL,
  PORTFOLIO_EDGE_LABEL,
  VERDICT_LABEL,
  TIER_LABEL,
  WATCHLIST_STATUS_LABEL,
} from "@/lib/labels";

describe("labels.HEADER_GLOSS", () => {
  it("has an entry for every Today/Screener table header code", () => {
    for (const key of ["C", "⚑", "Cat", "Sent", "Tech", "Fund", "RS-Ratio", "RS-Mom", "Breadth", "n"]) {
      expect(HEADER_GLOSS[key]).toBeTruthy();
    }
  });
});

describe("labels.QUADRANT_LABEL", () => {
  it("has all four RRG quadrants", () => {
    expect(QUADRANT_LABEL.leading).toBe("Leading");
    expect(QUADRANT_LABEL.weakening).toBe("Weakening");
    expect(QUADRANT_LABEL.lagging).toBe("Lagging");
    expect(QUADRANT_LABEL.improving).toBe("Improving");
  });
});

describe("labels.COMBO_POSITION_LABEL", () => {
  it("lists exactly 4 families in builder.py order, breakout second", () => {
    expect(COMBO_POSITION_LABEL.map(([family]) => family)).toEqual([
      "ma_trend",
      "breakout",
      "squeeze",
      "momentum_osc",
    ]);
  });
});

describe("labels.COMBO_LETTER_LABEL", () => {
  it("glosses L/S/N", () => {
    expect(COMBO_LETTER_LABEL.L).toBe("Long-dominant");
    expect(COMBO_LETTER_LABEL.S).toBe("Short-dominant");
    expect(COMBO_LETTER_LABEL.N).toBe("Mixed / no dominant side");
  });
});

describe("labels.LADDER_CODE_LABEL", () => {
  it("glosses SPOT/ZG/CW/PW", () => {
    for (const key of ["SPOT", "ZG", "CW", "PW"]) {
      expect(LADDER_CODE_LABEL[key as "SPOT"]).toBeTruthy();
    }
  });
});

describe("labels.GREEK_LABEL", () => {
  it("has symbol + gloss for all 5 greeks", () => {
    expect(GREEK_LABEL.delta.symbol).toBe("Δ");
    expect(GREEK_LABEL.theta.symbol).toBe("Θ");
    expect(GREEK_LABEL.rho.gloss).toContain("interest rate");
  });
});

describe("labels.QUADRANT_GLOSS (RO-08)", () => {
  it("glosses every quadrant the chart can draw", () => {
    for (const key of Object.keys(QUADRANT_LABEL) as (keyof typeof QUADRANT_LABEL)[]) {
      expect(QUADRANT_GLOSS[key]).toBeTruthy();
    }
  });

  it("says which half of each axis the quadrant sits on, not just the word again", () => {
    // "Weakening" is on the strong side of RS-Ratio — the gloss is the only
    // thing that stops that reading backwards.
    expect(QUADRANT_GLOSS.weakening).toMatch(/^strong/);
    expect(QUADRANT_GLOSS.leading).toMatch(/^strong/);
    expect(QUADRANT_GLOSS.improving).toMatch(/^weak/);
    expect(QUADRANT_GLOSS.lagging).toMatch(/^weak/);
  });
});

describe("labels.PORTFOLIO_EDGE_LABEL", () => {
  it("covers all 6 tracker.py edge values", () => {
    for (const key of ["HOLD/ADD", "CONSIDER SELLING", "CONSIDER COVERING", "NEUTRAL", "N/A", "NO DATA"]) {
      expect(PORTFOLIO_EDGE_LABEL[key]).toBeTruthy();
    }
  });
});

describe("labels.VERDICT_LABEL / TIER_LABEL / WATCHLIST_STATUS_LABEL", () => {
  it("cover their closed value sets", () => {
    expect(VERDICT_LABEL.LONG).toBeTruthy();
    expect(VERDICT_LABEL.SHORT).toBeTruthy();
    expect(VERDICT_LABEL.WAIT).toBeTruthy();
    expect(TIER_LABEL.PRIME_LONG).toBeTruthy();
    expect(TIER_LABEL.AVOID).toBeTruthy();
    expect(WATCHLIST_STATUS_LABEL.in).toBe("Still in setup");
    expect(WATCHLIST_STATUS_LABEL.out).toBe("Setup invalidated");
  });
});
