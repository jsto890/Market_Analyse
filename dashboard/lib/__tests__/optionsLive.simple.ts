/**
 * Simple compile-time type check for optionsLive
 * Run with: npx tsc --noEmit lib/__tests__/optionsLive.simple.ts
 */

import { OptionLiveQuote, StrikeLevel, LadderSnapshot, fetchOptionsLive } from "../optionsLive";

// Test OptionLiveQuote interface
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

// Test StrikeLevel interface
const level: StrikeLevel = {
  strike: 100,
  call: quote,
  put: quote,
  zero_gamma_side: "C",
  wall_type: "call",
  gex_by_strike: -500000,
  call_gex_by_strike: -300000,
  put_gex_by_strike: -200000,
  max_pain_delta: 0.1,
};

// Test LadderSnapshot interface
const snapshot: LadderSnapshot = {
  symbol: "SPY",
  spot: 565,
  as_of: new Date().toISOString(),
  source: "LIVE",
  stale_ms: 0,
  fresh_contract_ratio: 0.95,
  expiry: "0DTE",
  levels: [level],
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

// Test fetchOptionsLive function signature
const fetchPromise: Promise<LadderSnapshot | null> = fetchOptionsLive("SPY", "0DTE");

console.log("✓ All types compile successfully");
