import { describe, it, expect } from "vitest";
import { groupSignals, tierSort, comboClass, deriveGroup, GROUP_LABEL } from "@/lib/groups";

describe("groupSignals", () => {
  it("groups by report_group with fallback derivation", () => {
    const g = groupSignals([
      { ticker: "A", report_group: "aligned" },
      { ticker: "B", report_group: "pullback" },
      { ticker: "C", report_group: "tech_fund" },
      { ticker: "D", report_group: "other" },
    ] as any);
    expect(g.aligned.map((r) => r.ticker)).toEqual(["A"]);
    expect(g.other.map((r) => r.ticker)).toEqual(["D"]);
  });
});

describe("tierSort", () => {
  it("sorts tier > combo class > combined, never raw score first", () => {
    const rows = [
      { ticker: "X", action_label: "STANDARD_LONG", combo: "LNNL", combined_score: 0.9 },
      { ticker: "Y", action_label: "PRIME_LONG", combo: "LSNS", combined_score: 0.4 },
    ] as any;
    expect([...rows].sort(tierSort)[0].ticker).toBe("Y");
  });
});

describe("comboClass", () => {
  it("classifies combos", () => {
    expect(comboClass("LSNS")).toBe("strong");
    expect(comboClass("LNNL")).toBe("weak");
    expect(comboClass("LLNS")).toBe("neutral");
  });

  it("classifies 5-char production combos on first 4 chars", () => {
    expect(comboClass("LSNLL")).toBe("strong"); // prefix LSNL
    expect(comboClass("LLNLL")).toBe("weak");   // prefix LLNL
    expect(comboClass("LLLLL")).toBe("neutral");
  });
});

describe("deriveGroup", () => {
  it("is exported and classifies a row the same way groupSignals does internally", () => {
    expect(deriveGroup({ group1: true } as any)).toBe("aligned");
    expect(
      deriveGroup({ group1: false, group2: true, conviction: "high", sentiment_score: 0.1 } as any)
    ).toBe("pullback");
    expect(deriveGroup({ group1: false, group2: true, conviction: "low", sentiment_score: 0.5 } as any)).toBe(
      "tech_fund"
    );
    expect(deriveGroup({ group1: false, group2: false } as any)).toBe("other");
  });
});

describe("GROUP_LABEL", () => {
  it("has a short-form label for every ReportGroup value", () => {
    expect(GROUP_LABEL.aligned).toBe("aligned");
    expect(GROUP_LABEL.pullback).toBe("pullback");
    expect(GROUP_LABEL.tech_fund).toBe("tech+fund");
    expect(GROUP_LABEL.other).toBe("other");
  });
});
