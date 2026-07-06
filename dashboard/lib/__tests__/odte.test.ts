import { describe, it, expect } from "vitest";
import { odteBadge, odteSymbols, isOdteSymbol } from "@/lib/odte";

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
  it("is exactly the four switchable ETFs", () => {
    expect(odteSymbols).toEqual(["SPY", "QQQ", "IWM", "DIA"]);
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
});

describe("odteBadge with symbol field", () => {
  it("is unaffected by symbol in the health payload", () => {
    expect(odteBadge({ ok: true, ibkr_connected: true, symbol: "SPY" })).toEqual({
      label: "Live",
      tone: "live",
    });
  });
});
