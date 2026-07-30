/**
 * Types and fetch functions for live options ladder from /api/options/live/{symbol}
 */

export interface OptionLiveQuote {
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spread_pct: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  per_dollar_gamma: number | null;
  per_dollar_delta: number | null;
  volume: number | null;
  oi: number | null;
  stale_ms: number;
  liquid: boolean;
}

export interface StrikeLevel {
  strike: number;
  call: OptionLiveQuote;
  put: OptionLiveQuote;
  zero_gamma_side: string | null;
  wall_type: string | null;
  gex_by_strike: number | null;
  max_pain_delta: number | null;
}

export interface LadderSnapshot {
  symbol: string;
  spot: number;
  as_of: string; // ISO datetime
  source: "LIVE" | "FROZEN" | "EOD";
  stale_ms: number;
  fresh_contract_ratio: number;
  expiry: string;
  levels: StrikeLevel[];
  atm_strike: number;
  zero_gamma_strike: number | null;
  call_wall_strike: number | null;
  put_wall_strike: number | null;
  max_pain: number | null;
  pin_risk: number;
  net_gex_band: string;
  msi_call_strike: number | null;
  msi_put_strike: number | null;
  msi_rationale: string;
  gex_profile_json: string | null;
}

/**
 * Fetch live options ladder for a symbol from /api/options/live endpoint.
 * Returns null if fetch fails or data unavailable.
 */
export async function fetchOptionsLive(
  symbol: string,
  expiry: string = "0DTE"
): Promise<LadderSnapshot | null> {
  try {
    const res = await fetch(`/api/argus/options/live/${symbol}?expiry=${expiry}`);
    if (!res.ok) {
      console.warn(`Failed to fetch live ladder for ${symbol}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data as LadderSnapshot;
  } catch (err) {
    console.error(`Failed to fetch live ladder for ${symbol}:`, err);
    return null;
  }
}
