/**
 * Derived options analytics — density bands, delta bands, DEX profile, IV skew
 * and the most-valuable-contract ranking. Pure functions so they can be tested
 * without a live gateway; every consumer is a client component.
 */

import type { StrikeLevel } from "@/lib/optionsLive";

/* ------------------------------------------------------------------ density */

export const DENSITY_OPTIONS = [
  { key: "tight", label: "Tight", pct: 0.03, blurb: "±3% of spot" },
  { key: "normal", label: "Normal", pct: 0.06, blurb: "±6% of spot" },
  { key: "wide", label: "Wide", pct: 0.12, blurb: "±12% of spot" },
  { key: "all", label: "All", pct: null, blurb: "every strike returned" },
] as const;

export type DensityKey = (typeof DENSITY_OPTIONS)[number]["key"];

export function densityPct(key: string): number | null {
  const found = DENSITY_OPTIONS.find((d) => d.key === key);
  return found ? found.pct : 0.06;
}

/** Strikes within `pct` of spot. `pct === null` (or no spot) keeps everything. */
export function withinBand<T extends { strike: number }>(
  rows: T[],
  spot: number | null | undefined,
  pct: number | null
): T[] {
  if (pct === null || spot == null || !Number.isFinite(spot) || spot <= 0) return rows;
  const lo = spot * (1 - pct);
  const hi = spot * (1 + pct);
  return rows.filter((r) => r.strike >= lo && r.strike <= hi);
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
