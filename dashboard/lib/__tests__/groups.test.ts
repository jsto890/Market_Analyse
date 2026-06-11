import { describe, it, expect } from "vitest";
import { groupSignals, tierSort, comboClass } from "@/lib/groups";

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
});
