/**
 * Test suite for optionsLive types and fetch function
 */

import { OptionLiveQuote, StrikeLevel, LadderSnapshot, fetchOptionsLive } from "../optionsLive";

describe("optionsLive types", () => {
  test("OptionLiveQuote interface exports correctly", () => {
    const quote: OptionLiveQuote = {
      bid: 1.5,
      ask: 1.6,
      mid: 1.55,
      spread_pct: 0.65,
      iv: 0.25,
      delta: 0.5,
      gamma: 0.01,
      theta: -0.05,
      vega: 0.2,
      rho: 0.1,
      per_dollar_gamma: 1.05,
      per_dollar_delta: 50,
      volume: 100,
      oi: 1000,
      stale_ms: 0,
      liquid: true,
    };
    expect(quote.bid).toBe(1.5);
    expect(quote.iv).toBe(0.25);
  });

  test("StrikeLevel interface exports correctly", () => {
    const call: OptionLiveQuote = {
      bid: 1.5,
      ask: 1.6,
      mid: 1.55,
      spread_pct: 0.65,
      iv: 0.25,
      delta: 0.5,
      gamma: 0.01,
      theta: -0.05,
      vega: 0.2,
      rho: 0.1,
      per_dollar_gamma: 1.05,
      per_dollar_delta: 50,
      volume: 100,
      oi: 1000,
      stale_ms: 0,
      liquid: true,
    };

    const put: OptionLiveQuote = {
      bid: 0.5,
      ask: 0.6,
      mid: 0.55,
      spread_pct: 0.91,
      iv: 0.23,
      delta: -0.5,
      gamma: 0.01,
      theta: -0.02,
      vega: 0.2,
      rho: -0.1,
      per_dollar_gamma: 1.05,
      per_dollar_delta: -50,
      volume: 150,
      oi: 1200,
      stale_ms: 0,
      liquid: true,
    };

    const level: StrikeLevel = {
      strike: 100,
      call,
      put,
      zero_gamma_side: null,
      wall_type: null,
      gex_by_strike: -500000,
      max_pain_delta: 0.1,
    };

    expect(level.strike).toBe(100);
    expect(level.call.bid).toBe(1.5);
    expect(level.put.bid).toBe(0.5);
  });

  test("LadderSnapshot interface exports correctly", () => {
    const ladder: LadderSnapshot = {
      symbol: "SPY",
      spot: 565,
      as_of: new Date().toISOString(),
      source: "LIVE",
      stale_ms: 0,
      fresh_contract_ratio: 0.95,
      expiry: "0DTE",
      levels: [],
      atm_strike: 565,
      zero_gamma_strike: 567,
      call_wall_strike: 570,
      put_wall_strike: 560,
      max_pain: 564.5,
      pin_risk: 45,
      net_gex_band: "bullish",
      msi_call_strike: 570,
      msi_put_strike: 560,
      msi_rationale: "max concentration",
      gex_profile_json: null,
    };

    expect(ladder.symbol).toBe("SPY");
    expect(ladder.source).toBe("LIVE");
    expect(ladder.levels).toEqual([]);
  });

  test("fetchOptionsLive function is exported", () => {
    expect(typeof fetchOptionsLive).toBe("function");
  });

  test("fetchOptionsLive calls the Argus proxy, not the nonexistent /api/options/live route", async () => {
    const calls: string[] = [];
    global.fetch = ((url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ symbol: "SPY" }),
      }) as unknown as Promise<Response>;
    }) as typeof fetch;

    await fetchOptionsLive("SPY", "0DTE");

    expect(calls[0]).toBe("/api/argus/options/live/SPY?expiry=0DTE");
  });
});
