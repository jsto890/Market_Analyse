import { type OdteSymbol } from "@/lib/odte-core";

/**
 * Every underlying now has its own real option chain — indices are fetched from
 * yfinance under their caret symbol (^SPX, ^NDX, …) in the Argus data layer and
 * stored/served under the plain symbol. No ETF proxying: the companion IS the
 * symbol. Kept as a function so existing call sites don't need to change.
 */
export function companionSymbol(symbol: OdteSymbol): OdteSymbol {
  return symbol;
}

export function isProxied(_symbol: OdteSymbol): boolean {
  return false;
}

export interface GexLevels {
  date: string;
  symbol: string;
  expiry: string;
  zero_gamma: number | null;
  call_wall: number | null;
  put_wall: number | null;
  total_gex: number | null;
  caveat?: string;
}

export interface UnusualRow {
  contract: string;
  side: string;
  expiry: string;
  strike: number;
  score: number;
  vol: number | null;
  oi: number | null;
  persistence: number;
}

export interface UnusualPayload {
  symbol: string;
  as_of: string;
  rows: UnusualRow[];
}

export interface PcrPayload {
  symbol: string;
  as_of: string;
  pcr_vol: number | null;
  pcr_oi: number | null;
  call_vol: number;
  put_vol: number;
  call_oi: number;
  put_oi: number;
}

/** Billions/millions compaction for total GEX: values ≥ 1e8 render as B, ≥ 1e6 as M. Example: 350030658 -> "+0.35B" */
export function fmtGex(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "−";
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

/** Tone for P/C ratio: >=1.2 bearish(down), <=0.7 bullish(live), else neutral(warn). */
export function pcrTone(ratio: number | null): "live" | "warn" | "down" {
  if (ratio == null) return "warn";
  if (ratio >= 1.2) return "down";
  if (ratio <= 0.7) return "live";
  return "warn";
}

/** Signed % distance from spot to a level: spot 100, level 103 -> "+3.0%" */
export function pctFrom(spot: number | null, level: number | null): string {
  if (spot == null || level == null || spot === 0) return "—";
  const pct = ((level - spot) / spot) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
