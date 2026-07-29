import { describe, it, expect } from "vitest";
import { price, pct, pctWhole, signedCurrency, compactNumber, greek, relativeAge } from "@/lib/format";

describe("format.price", () => {
  it("formats with 2 decimals and a $ prefix", () => {
    expect(price(142.3)).toBe("$142.30");
  });
  it("returns em-dash for null/undefined/non-finite", () => {
    expect(price(null)).toBe("—");
    expect(price(undefined)).toBe("—");
    expect(price(NaN)).toBe("—");
  });
});

describe("format.pct", () => {
  it("treats unit=percent as already-scaled", () => {
    expect(pct(2.3, "percent")).toBe("+2.3%");
  });
  it("treats unit=fraction as needing *100", () => {
    expect(pct(0.023, "fraction")).toBe("+2.3%");
  });
  it("signs negatives", () => {
    expect(pct(-1.25, "percent")).toBe("-1.3%");
  });
});

describe("format.pctWhole", () => {
  it("rounds to a whole unsigned percent", () => {
    expect(pctWhole(72.6, "percent")).toBe("73%");
    expect(pctWhole(0.726, "fraction")).toBe("73%");
  });
});

describe("format.signedCurrency", () => {
  it("formats a positive delta with thousands separator", () => {
    expect(signedCurrency(1204.5)).toBe("+$1,204.50");
  });
  it("formats a negative delta", () => {
    expect(signedCurrency(-88)).toBe("-$88.00");
  });
});

describe("format.compactNumber", () => {
  it("compacts millions/thousands at 1dp", () => {
    expect(compactNumber(4_700_000)).toBe("4.7M");
    expect(compactNumber(12_300)).toBe("12.3K");
  });
  it("leaves sub-1000 as an integer", () => {
    expect(compactNumber(842)).toBe("842");
  });
});

describe("format.greek", () => {
  it("uses 3dp for delta/gamma/vega/rho", () => {
    expect(greek(0.4213, "delta")).toBe("0.421");
  });
  it("uses 2dp for theta", () => {
    expect(greek(-0.128, "theta")).toBe("-0.13");
  });
});

describe("format.relativeAge", () => {
  it("renders seconds/minutes/hours/days", () => {
    expect(relativeAge(42)).toBe("42s");
    expect(relativeAge(150)).toBe("3m");
    expect(relativeAge(7200)).toBe("2h");
    expect(relativeAge(259200)).toBe("3d");
  });
});
