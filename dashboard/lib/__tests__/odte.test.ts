import { describe, it, expect } from "vitest";
import { odteBadge, odteSymbols, isOdteSymbol, odteEtfSymbols, odteIndexSymbols } from "@/lib/odte";

describe("odteBadge", () => {
  it("Live when ok and ibkr connected", () => {
    expect(odteBadge({ ok: true, ibkr_connected: true })).toEqual({ label: "Live", tone: "live" });
  });
  it("IBKR disconnected when ok but ibkr down", () => {
    expect(odteBadge({ ok: true, ibkr_connected: false })).toEqual({ label: "IBKR disconnected", tone: "warn" });
  });
  it("Service down when ok is false", () => {
    expect(odteBadge({ ok: false, ibkr_connected: false })).toEqual({ label: "Service down", tone: "down" });
  });
  it("Service down when health is null (proxy failed)", () => {
    expect(odteBadge(null)).toEqual({ label: "Service down", tone: "down" });
  });
  it("Service down when health is undefined (first render)", () => {
    expect(odteBadge(undefined)).toEqual({ label: "Service down", tone: "down" });
  });
});

describe("odteSymbols", () => {
  it("covers all eight symbols in order", () => {
    expect([...odteSymbols]).toEqual(["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"]);
  });

  it("splits ETF and index groups", () => {
    expect([...odteEtfSymbols]).toEqual(["SPY", "QQQ", "IWM", "DIA"]);
    expect([...odteIndexSymbols]).toEqual(["SPX", "NDX", "RUT", "DJX"]);
  });
});

describe("isOdteSymbol", () => {
  it("accepts every allow-list member", () => {
    for (const s of odteSymbols) expect(isOdteSymbol(s)).toBe(true);
  });
  it("rejects unknown, empty, and lowercase symbols", () => {
    expect(isOdteSymbol("TSLA")).toBe(false);
    expect(isOdteSymbol("")).toBe(false);
    expect(isOdteSymbol("spy")).toBe(false);
  });
  it("accepts index symbols in the guard", () => {
    expect(isOdteSymbol("SPX")).toBe(true);
    expect(isOdteSymbol("VIX")).toBe(false);
  });
});

describe("odteBadge with symbol field", () => {
  it("is unaffected by symbol in the health payload", () => {
    expect(odteBadge({ ok: true, ibkr_connected: true, symbol: "SPY" })).toEqual({
      label: "Live",
      tone: "live",
    });
  });
});
