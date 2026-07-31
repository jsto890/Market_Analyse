/** Price, always 2dp with a leading "$". Returns "—" for null/non-finite. */
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

/**
 * Percent/return, 1dp, signed. Caller declares whether the source value is
 * already a ×100 percent ("percent") or a raw fraction ("fraction").
 * Returns "—" for null/non-finite.
 */
export function pct(v: number | null | undefined, unit: "percent" | "fraction"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const asPercent = unit === "fraction" ? v * 100 : v;
  const sign = asPercent >= 0 ? "+" : "";
  return `${sign}${asPercent.toFixed(1)}%`;
}

/** Whole-number percent (agreement/coverage figures). Unsigned. */
export function pctWhole(v: number | null | undefined, unit: "percent" | "fraction"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const asPercent = unit === "fraction" ? v * 100 : v;
  return `${Math.round(asPercent)}%`;
}

/** Signed currency delta, e.g. "+$1,204.50" / "-$88.00". 2dp, thousands-separated. */
export function signedCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Compact large number (GEX notional, OI, volume, market cap): "842", "12.3K", "4.7M", "1.2B", "3.4T". */
export function compactNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

export type GreekKind = "delta" | "gamma" | "theta" | "vega" | "rho";

/** Option greek, precision per-kind. Returns "—" for null/non-finite. */
export function greek(v: number | null | undefined, kind: GreekKind): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const dp = kind === "theta" ? 2 : 3;
  const sign = v >= 0 ? "" : "-";
  return `${sign}${Math.abs(v).toFixed(dp)}`;
}

/** Relative age from a duration in **seconds**. "3s", "42s", "5m", "2h", "3d". */
export function relativeAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
