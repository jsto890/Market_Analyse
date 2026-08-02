/**
 * Derived options analytics — density bands, delta bands, DEX profile, IV skew
 * and the most-valuable-contract ranking. Pure functions so they can be tested
 * without a live gateway; every consumer is a client component.
 */

import type { StrikeLevel } from "@/lib/optionsLive";

/* ------------------------------------------------------------------ density */

/** Counted in strikes, not percent of spot: ±6% is 76 strikes on SPY and 4 on a
 * $20 name, so a percent band means a different ladder on every symbol. */
/* `strikes`, not `count`: these feed `SegmentedControl`, whose own `count` is
 * the badge printed beside a segment's label. "±10" already says 10. */
export const DENSITY_OPTIONS = [
  { key: "n10", label: "±10", strikes: 10, blurb: "10 strikes either side of spot" },
  { key: "n20", label: "±20", strikes: 20, blurb: "20 strikes either side of spot" },
  { key: "n40", label: "±40", strikes: 40, blurb: "40 strikes either side of spot" },
  { key: "all", label: "All", strikes: null, blurb: "every strike the chain returned" },
] as const;

export type DensityKey = (typeof DENSITY_OPTIONS)[number]["key"];

export const DEFAULT_DENSITY: DensityKey = "n20";

/** Coerce a stored value to a live key — the setting predates strike counts and
 * localStorage still holds `tight`/`normal`/`wide` for anyone who set it. */
export function normalizeDensity(key: string): DensityKey {
  const found = DENSITY_OPTIONS.find((d) => d.key === key);
  if (found) return found.key;
  return key === "all" ? "all" : DEFAULT_DENSITY;
}

export function densityCount(key: string): number | null {
  const found = DENSITY_OPTIONS.find((d) => d.key === key);
  return found ? found.strikes : 20;
}

/**
 * The `count` strikes either side of spot. `count === null` (or no spot) keeps
 * everything. Counting outward from the strike nearest spot rather than
 * slicing a price window is what makes the row count the same on every symbol.
 */
export function withinStrikes<T extends { strike: number }>(
  rows: T[],
  spot: number | null | undefined,
  count: number | null
): T[] {
  if (count === null || spot == null || !Number.isFinite(spot) || spot <= 0) return rows;
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  if (sorted.length === 0) return rows;
  let atm = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].strike - spot) < Math.abs(sorted[atm].strike - spot)) atm = i;
  }
  const keep = new Set(sorted.slice(Math.max(0, atm - count), atm + count + 1));
  return rows.filter((r) => keep.has(r));
}

/* --------------------------------------------------------------- delta bands */

/** 50Δ ≈ at the money, 25Δ ≈ the conventional wing, 16Δ ≈ the ~1-in-6 tail. */
export const DELTA_TARGETS = [0.5, 0.25, 0.16] as const;

export interface DeltaBandRow {
  target: number;
  callStrike: number | null;
  callDelta: number | null;
  callIv: number | null;
  putStrike: number | null;
  putDelta: number | null;
  putIv: number | null;
}

function nearestByDelta(
  levels: StrikeLevel[],
  side: "call" | "put",
  target: number
): StrikeLevel | null {
  let best: StrikeLevel | null = null;
  let bestErr = Infinity;
  for (const l of levels) {
    const d = l[side].delta;
    if (d == null || !Number.isFinite(d)) continue;
    const err = Math.abs(Math.abs(d) - target);
    if (err < bestErr) {
      bestErr = err;
      best = l;
    }
  }
  return best;
}

export function deltaBands(
  levels: StrikeLevel[],
  targets: readonly number[] = DELTA_TARGETS
): DeltaBandRow[] {
  return targets.map((target) => {
    const c = nearestByDelta(levels, "call", target);
    const p = nearestByDelta(levels, "put", target);
    return {
      target,
      callStrike: c?.strike ?? null,
      callDelta: c?.call.delta ?? null,
      callIv: c?.call.iv ?? null,
      putStrike: p?.strike ?? null,
      putDelta: p?.put.delta ?? null,
      putIv: p?.put.iv ?? null,
    };
  });
}

/* --------------------------------------------------------------- DEX profile */

export interface DexPoint {
  strike: number;
  /** Dealer delta exposure booked at this strike, in notional dollars. */
  dex: number;
  /** Running sum from the lowest strike up. */
  cumulative: number;
}

export interface DexProfile {
  points: DexPoint[];
  /** Strike where cumulative dealer delta crosses zero, interpolated. */
  flipStrike: number | null;
  total: number;
}

/**
 * Dealer delta by strike, signed the market-maker way: dealers are short the
 * calls and puts customers buy, so `callΔ·callOI − putΔ·putOI`, scaled by the
 * contract multiplier and spot to get notional dollars.
 */
export function dexProfile(
  levels: StrikeLevel[],
  spot: number | null | undefined,
  multiplier = 100
): DexProfile {
  const px = spot != null && Number.isFinite(spot) && spot > 0 ? spot : 1;
  const sorted = [...levels].sort((a, b) => a.strike - b.strike);
  const points: DexPoint[] = [];
  let running = 0;
  for (const l of sorted) {
    const cd = l.call.delta ?? 0;
    const pd = l.put.delta ?? 0;
    const coi = l.call.oi ?? 0;
    const poi = l.put.oi ?? 0;
    const dex = (cd * coi - pd * poi) * multiplier * px;
    running += dex;
    points.push({ strike: l.strike, dex, cumulative: running });
  }

  let flipStrike: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.cumulative <= 0 && b.cumulative >= 0) || (a.cumulative >= 0 && b.cumulative <= 0)) {
      const span = b.cumulative - a.cumulative;
      const t = span === 0 ? 0 : -a.cumulative / span;
      flipStrike = a.strike + t * (b.strike - a.strike);
      break;
    }
  }

  return { points, flipStrike, total: running };
}

/* ------------------------------------------------- aggregate dealer exposure */

export interface ExposureTotals {
  /** Dollars of underlying dealers hold per the whole chain. */
  dex: number;
  /** Dollars of delta dealers must trade per 1% move in spot. */
  gex: number;
  /** Dollars dealers gain or lose per 1 implied-vol point. */
  vex: number;
  /** Dollars of time decay accruing to dealers per day. */
  tex: number;
  /** Contracts that carried the greek — the rest were quoted without one. */
  covered: { dex: number; gex: number; vex: number; tex: number };
}

/**
 * Chain-wide dealer exposure, one number per greek. Signed the same way as
 * `dexProfile`: dealers are short what customers buy, so `call·callOI −
 * put·putOI`. Contracts quoted without a greek are skipped rather than counted
 * as zero, and `covered` reports how many made it in — an exposure summed over
 * a third of the chain is a different number, not a smaller one.
 */
export function exposureTotals(
  levels: StrikeLevel[],
  spot: number | null | undefined,
  multiplier = 100
): ExposureTotals {
  const px = spot != null && Number.isFinite(spot) && spot > 0 ? spot : 1;
  const t = { dex: 0, gex: 0, vex: 0, tex: 0 };
  const covered = { dex: 0, gex: 0, vex: 0, tex: 0 };

  for (const l of levels) {
    const coi = l.call.oi ?? 0;
    const poi = l.put.oi ?? 0;
    if (l.call.delta != null || l.put.delta != null) {
      t.dex += ((l.call.delta ?? 0) * coi - (l.put.delta ?? 0) * poi) * multiplier * px;
      covered.dex++;
    }
    if (l.call.gamma != null || l.put.gamma != null) {
      // ×spot² ×0.01: gamma is dΔ per $1, so the dollar figure per 1% move is
      // Γ · spot · (1% of spot) · multiplier.
      t.gex += ((l.call.gamma ?? 0) * coi - (l.put.gamma ?? 0) * poi) * multiplier * px * px * 0.01;
      covered.gex++;
    }
    if (l.call.vega != null || l.put.vega != null) {
      t.vex += ((l.call.vega ?? 0) * coi - (l.put.vega ?? 0) * poi) * multiplier;
      covered.vex++;
    }
    if (l.call.theta != null || l.put.theta != null) {
      // Negated: theta is quoted from the holder's side, and the dealer is on
      // the other one — decay the customer pays is decay the dealer collects.
      t.tex -= ((l.call.theta ?? 0) * coi - (l.put.theta ?? 0) * poi) * multiplier;
      covered.tex++;
    }
  }

  return { ...t, covered };
}

/* ------------------------------------------------------------------ IV skew */

export interface SkewPoint {
  strike: number;
  callIv: number | null;
  putIv: number | null;
  /** put IV − call IV, in IV points (0.02 = 2 vol points of put premium). */
  skew: number | null;
}

export function ivSkewProfile(
  rows: { strike: number; call: { iv: number | null } | null; put: { iv: number | null } | null }[]
): SkewPoint[] {
  return [...rows]
    .sort((a, b) => a.strike - b.strike)
    .map((r) => {
      const callIv = r.call?.iv ?? null;
      const putIv = r.put?.iv ?? null;
      return {
        strike: r.strike,
        callIv,
        putIv,
        skew: callIv != null && putIv != null ? putIv - callIv : null,
      };
    });
}

/** put IV − call IV at the strike nearest spot. */
export function atmSkew(points: SkewPoint[], spot: number | null | undefined): number | null {
  if (spot == null || points.length === 0) return null;
  let best: SkewPoint | null = null;
  let bestErr = Infinity;
  for (const p of points) {
    if (p.skew == null) continue;
    const err = Math.abs(p.strike - spot);
    if (err < bestErr) {
      bestErr = err;
      best = p;
    }
  }
  return best?.skew ?? null;
}

/**
 * 25Δ risk reversal in IV terms: the IV of the 25Δ put minus the IV of the 25Δ
 * call. Positive means downside protection is bid; negative is call skew.
 */
export function deltaSkew(levels: StrikeLevel[], target = 0.25): number | null {
  const c = nearestByDelta(levels, "call", target);
  const p = nearestByDelta(levels, "put", target);
  if (c?.call.iv == null || p?.put.iv == null) return null;
  return p.put.iv - c.call.iv;
}

/* --------------------------------------------------------------------- MVC */

export interface MvcRow {
  strike: number;
  side: "call" | "put";
  mid: number;
  delta: number;
  gamma: number;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  /** Gamma bought per dollar of premium — the convexity the contract pays for. */
  gammaPerDollar: number;
  deltaPerDollar: number;
  /** Daily decay as a share of premium; the cost side of the same trade. */
  thetaPerDollar: number | null;
  spreadPct: number | null;
  oi: number | null;
  volume: number | null;
  /** 0–1 composite; only comparable within one ladder snapshot. */
  score: number;
  reason: string;
}

export interface MvcOptions {
  limit?: number;
  /** Reject anything quoting wider than this (percent of mid). */
  maxSpreadPct?: number;
  /** Require the broker's own liquidity flag as well as the spread test. */
  requireLiquid?: boolean;
  minOi?: number;
}

function candidate(level: StrikeLevel, side: "call" | "put"): Omit<MvcRow, "score" | "reason"> | null {
  const q = level[side];
  const mid = q.mid ?? (q.bid != null && q.ask != null ? (q.bid + q.ask) / 2 : null);
  if (mid == null || !Number.isFinite(mid) || mid <= 0) return null;
  if (q.delta == null || q.gamma == null) return null;
  const gammaPerDollar = q.per_dollar_gamma ?? q.gamma / mid;
  const deltaPerDollar = q.per_dollar_delta ?? Math.abs(q.delta) / mid;
  if (!Number.isFinite(gammaPerDollar) || !Number.isFinite(deltaPerDollar)) return null;
  return {
    strike: level.strike,
    side,
    mid,
    delta: q.delta,
    gamma: q.gamma,
    theta: q.theta,
    vega: q.vega,
    iv: q.iv,
    gammaPerDollar: Math.abs(gammaPerDollar),
    deltaPerDollar: Math.abs(deltaPerDollar),
    thetaPerDollar: q.theta != null ? q.theta / mid : null,
    spreadPct: q.spread_pct,
    oi: q.oi,
    volume: q.volume,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Most valuable contracts: the ladder's best greeks per dollar of premium,
 * after throwing out anything that can't actually be traded at the screen
 * price. Weighted toward gamma because convexity is what a short-dated option
 * is bought for; the spread multiplier is the round-trip cost of finding out.
 */
export function rankMvc(levels: StrikeLevel[], opts: MvcOptions = {}): MvcRow[] {
  const { limit = 6, maxSpreadPct = 15, requireLiquid = false, minOi = 0 } = opts;

  const pool: Omit<MvcRow, "score" | "reason">[] = [];
  for (const level of levels) {
    for (const side of ["call", "put"] as const) {
      const q = level[side];
      if (requireLiquid && !q.liquid) continue;
      if (q.spread_pct != null && q.spread_pct > maxSpreadPct) continue;
      if (minOi > 0 && (q.oi ?? 0) < minOi) continue;
      const c = candidate(level, side);
      if (c) pool.push(c);
    }
  }
  if (pool.length === 0) return [];

  const maxGamma = Math.max(...pool.map((c) => c.gammaPerDollar));
  const maxDelta = Math.max(...pool.map((c) => c.deltaPerDollar));
  const medGamma = median(pool.map((c) => c.gammaPerDollar));

  const scored: MvcRow[] = pool.map((c) => {
    const gNorm = maxGamma > 0 ? c.gammaPerDollar / maxGamma : 0;
    const dNorm = maxDelta > 0 ? c.deltaPerDollar / maxDelta : 0;
    // A 15%-wide quote costs about a third of the edge before you start.
    const spreadPenalty = 1 - Math.min(c.spreadPct ?? 0, 30) / 45;
    const score = (0.6 * gNorm + 0.4 * dNorm) * spreadPenalty;
    const gammaMultiple = medGamma > 0 ? c.gammaPerDollar / medGamma : 0;
    const reason = [
      gammaMultiple > 0 ? `${gammaMultiple.toFixed(1)}× median Γ/$` : null,
      c.spreadPct != null ? `${c.spreadPct.toFixed(1)}% spread` : null,
      c.oi != null ? `${c.oi.toFixed(0)} OI` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return { ...c, score, reason };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
