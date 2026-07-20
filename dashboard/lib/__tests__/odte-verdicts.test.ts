import { describe, it, expect } from "vitest";
import { deriveLevels, deriveFlow, deriveShape } from "../odte-verdicts";

describe("deriveLevels", () => {
  it("above zero-gamma with positive GEX -> good/supportive", () => {
    const v = deriveLevels({ spot: 752, zeroGamma: 748.9, callWall: 755, putWall: 745, totalGex: 1.5e9 });
    expect(v.status).toBe("good");
    expect(v.sentence).toContain("supportive");
    expect(v.sentence).toContain("+0.4%");
  });
  it("below zero-gamma -> caution/fragile", () => {
    const v = deriveLevels({ spot: 743.3, zeroGamma: 748.9, callWall: 745, putWall: 745, totalGex: 1.5e9 });
    expect(v.status).toBe("caution");
    expect(v.sentence).toContain("below zero-gamma");
  });
  it("pinned within 0.3% -> neutral", () => {
    const v = deriveLevels({ spot: 749.5, zeroGamma: 748.9, callWall: 750, putWall: 745, totalGex: 5e8 });
    expect(v.status).toBe("neutral");
    expect(v.sentence).toContain("pinned");
  });
  it("missing inputs -> null", () => {
    expect(deriveLevels({ spot: null, zeroGamma: 748.9, callWall: null, putWall: null, totalGex: null })).toBeNull();
  });
});

describe("deriveFlow", () => {
  it("call-heavy volume -> good", () => {
    expect(deriveFlow({ pcrVol: 0.6, pcrOi: 1.1, unusualCount: 2 })!.status).toBe("good");
  });
  it("balanced -> neutral", () => {
    expect(deriveFlow({ pcrVol: 1.0, pcrOi: 1.2, unusualCount: 0 })!.status).toBe("neutral");
  });
  it("put-heavy -> caution with unusual count surfaced", () => {
    const v = deriveFlow({ pcrVol: 1.4, pcrOi: 1.9, unusualCount: 5 })!;
    expect(v.status).toBe("caution");
    expect(v.sentence).toContain("5 unusual");
  });
  it("missing -> null", () => expect(deriveFlow({ pcrVol: null, pcrOi: null, unusualCount: 0 })).toBeNull());
});

describe("deriveShape", () => {
  it("puts much richer than calls -> caution (downside hedging bid)", () => {
    const v = deriveShape({ atmPutIv: 0.3, atmCallIv: 0.2 })!;
    expect(v.status).toBe("caution");
    expect(v.sentence).toContain("put skew");
  });
  it("flat skew -> neutral", () => {
    expect(deriveShape({ atmPutIv: 0.21, atmCallIv: 0.2 })!.status).toBe("neutral");
  });
  it("call skew -> good (upside chase)", () => {
    expect(deriveShape({ atmPutIv: 0.18, atmCallIv: 0.22 })!.status).toBe("good");
  });
  it("missing -> null", () => expect(deriveShape({ atmPutIv: null, atmCallIv: 0.2 })).toBeNull());
});
