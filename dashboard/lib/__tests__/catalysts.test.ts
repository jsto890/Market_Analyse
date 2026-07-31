import { describe, it, expect } from "vitest";
import { catalystText, parseCatalysts } from "@/lib/catalysts";

describe("parseCatalysts", () => {
  it("splits on the separator, not on the sign", () => {
    // Splitting on `+` left ", earnings_beat" as the second token.
    expect(parseCatalysts("contract+, earnings_beat+")).toEqual([
      { label: "contract", direction: "up" },
      { label: "earnings beat", direction: "up" },
    ]);
  });

  it("reads the direction off the suffix", () => {
    expect(parseCatalysts("guidance_cut-;analyst_upgrade+;buyback")).toEqual([
      { label: "guidance cut", direction: "down" },
      { label: "analyst upgrade", direction: "up" },
      { label: "buyback", direction: null },
    ]);
  });

  it("drops the feed's empty marker rather than printing it", () => {
    // The bridge writes a literal `nan` when a name has no catalysts.
    expect(parseCatalysts("nan")).toEqual([]);
    expect(parseCatalysts("NaN")).toEqual([]);
    expect(parseCatalysts(null)).toEqual([]);
    expect(parseCatalysts("")).toEqual([]);
    expect(parseCatalysts(", ,")).toEqual([]);
  });

  it("strips the quoting the CSV column arrives with", () => {
    expect(parseCatalysts('"contract+"')).toEqual([{ label: "contract", direction: "up" }]);
  });
});

describe("catalystText", () => {
  it("arrows a signed token and leaves an unsigned one alone", () => {
    expect(catalystText({ label: "earnings beat", direction: "up" })).toBe("earnings beat ▲");
    expect(catalystText({ label: "guidance cut", direction: "down" })).toBe("guidance cut ▼");
    expect(catalystText({ label: "buyback", direction: null })).toBe("buyback");
  });
});
