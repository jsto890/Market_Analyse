import { describe, it, expect, beforeEach } from "vitest";
import { setTickerNav, getTickerNav } from "@/lib/tickerNav";

beforeEach(() => sessionStorage.clear());

describe("tickerNav", () => {
  it("round-trips group + ticker list through sessionStorage", () => {
    setTickerNav("ALIGNED", ["AAPL", "NVDA", "AVGO"]);
    expect(getTickerNav()).toEqual({ group: "ALIGNED", tickers: ["AAPL", "NVDA", "AVGO"] });
  });

  it("returns null when nothing has been stored", () => {
    expect(getTickerNav()).toBeNull();
  });

  it("returns null for malformed stored JSON", () => {
    sessionStorage.setItem("dash:ticker-nav", "{not json");
    expect(getTickerNav()).toBeNull();
  });
});
