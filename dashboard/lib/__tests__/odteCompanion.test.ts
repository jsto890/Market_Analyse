import { describe, it, expect } from "vitest";
import {
  companionSymbol,
  isProxied,
  fmtGex,
  pcrTone,
  pctFrom,
} from "../odteCompanion";
import type { OdteSymbol } from "@/lib/odte";

describe("odteCompanion", () => {
  describe("companionSymbol", () => {
    it("returns identity for ETF symbols", () => {
      expect(companionSymbol("SPY" as OdteSymbol)).toBe("SPY");
      expect(companionSymbol("QQQ" as OdteSymbol)).toBe("QQQ");
      expect(companionSymbol("IWM" as OdteSymbol)).toBe("IWM");
      expect(companionSymbol("DIA" as OdteSymbol)).toBe("DIA");
    });

    it("returns identity for index symbols (real chains, no ETF proxy)", () => {
      expect(companionSymbol("SPX" as OdteSymbol)).toBe("SPX");
      expect(companionSymbol("NDX" as OdteSymbol)).toBe("NDX");
      expect(companionSymbol("RUT" as OdteSymbol)).toBe("RUT");
      expect(companionSymbol("DJX" as OdteSymbol)).toBe("DJX");
    });
  });

  describe("isProxied", () => {
    it("returns false for index symbols (real chains now exist)", () => {
      expect(isProxied("SPX" as OdteSymbol)).toBe(false);
      expect(isProxied("NDX" as OdteSymbol)).toBe(false);
      expect(isProxied("RUT" as OdteSymbol)).toBe(false);
      expect(isProxied("DJX" as OdteSymbol)).toBe(false);
    });

    it("returns false for ETF symbols", () => {
      expect(isProxied("SPY" as OdteSymbol)).toBe(false);
      expect(isProxied("QQQ" as OdteSymbol)).toBe(false);
      expect(isProxied("IWM" as OdteSymbol)).toBe(false);
      expect(isProxied("DIA" as OdteSymbol)).toBe(false);
    });
  });

  describe("fmtGex", () => {
    it("formats large positive values in billions", () => {
      expect(fmtGex(350030658)).toBe("+0.35B");
    });

    it("formats large negative values in millions with U+2212 minus", () => {
      expect(fmtGex(-1500000)).toBe("−2M");
    });

    it("returns em-dash for null", () => {
      expect(fmtGex(null)).toBe("—");
    });

    it("boundary: large negative value in billions with U+2212 minus", () => {
      expect(fmtGex(-1.2e9)).toBe("−1.20B");
    });

    it("boundary: sub-billion value in millions", () => {
      expect(fmtGex(50_000_000)).toBe("+50M");
    });

    it("boundary: exactly at 1e8 threshold renders as billions", () => {
      expect(fmtGex(100_000_000)).toBe("+0.10B");
    });

    it("boundary: sub-million value formats as integer", () => {
      expect(fmtGex(500)).toBe("+500");
    });
  });

  describe("pcrTone", () => {
    it("returns 'down' for ratio >= 1.2", () => {
      expect(pcrTone(1.5)).toBe("down");
    });

    it("returns 'live' for ratio <= 0.7", () => {
      expect(pcrTone(0.5)).toBe("live");
    });

    it("returns 'warn' for ratio between 0.7 and 1.2", () => {
      expect(pcrTone(0.9)).toBe("warn");
    });

    it("returns 'warn' for null", () => {
      expect(pcrTone(null)).toBe("warn");
    });
  });

  describe("pctFrom", () => {
    it("calculates signed percent distance from spot to level", () => {
      expect(pctFrom(100, 103)).toBe("+3.0%");
      expect(pctFrom(100, 96.5)).toBe("-3.5%");
    });

    it("returns em-dash for null inputs", () => {
      expect(pctFrom(null, 5)).toBe("—");
    });

    it("zero spot guard: returns em-dash when spot is zero", () => {
      expect(pctFrom(0, 5)).toBe("—");
    });
  });
});
