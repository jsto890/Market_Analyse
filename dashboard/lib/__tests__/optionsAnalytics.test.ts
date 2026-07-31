import {
  DENSITY_OPTIONS,
  atmSkew,
  deltaBands,
  deltaSkew,
  densityPct,
  dexProfile,
  ivSkewProfile,
  rankMvc,
  withinBand,
} from "@/lib/optionsAnalytics";
import type { OptionLiveQuote, StrikeLevel } from "@/lib/optionsLive";

function quote(p: Partial<OptionLiveQuote> = {}): OptionLiveQuote {
  return {
    bid: 1,
    ask: 1.1,
    mid: 1.05,
    spread_pct: 5,
    iv: 0.2,
    delta: 0.5,
    gamma: 0.01,
    theta: -0.05,
    vega: 0.2,
    rho: 0.1,
    per_dollar_gamma: null,
    per_dollar_delta: null,
    volume: 100,
    oi: 1000,
    stale_ms: 0,
    liquid: true,
    ...p,
  };
}

function level(strike: number, call: Partial<OptionLiveQuote>, put: Partial<OptionLiveQuote>): StrikeLevel {
  return {
    strike,
    call: quote(call),
    put: quote(put),
    zero_gamma_side: null,
    wall_type: null,
    gex_by_strike: null,
    call_gex_by_strike: null,
    put_gex_by_strike: null,
    max_pain_delta: null,
  };
}

describe("density", () => {
  it("maps every option key to its band, and All to null", () => {
    expect(densityPct("tight")).toBe(0.03);
    expect(densityPct("all")).toBeNull();
    expect(DENSITY_OPTIONS.map((d) => d.key)).toEqual(["tight", "normal", "wide", "all"]);
  });

  it("falls back to the normal band for an unknown key", () => {
    expect(densityPct("nonsense")).toBe(0.06);
  });

  it("keeps only strikes inside the band, and everything when the band is null", () => {
    const rows = [{ strike: 90 }, { strike: 100 }, { strike: 103 }, { strike: 120 }];
    expect(withinBand(rows, 100, 0.05).map((r) => r.strike)).toEqual([100, 103]);
    expect(withinBand(rows, 100, null)).toHaveLength(4);
    expect(withinBand(rows, null, 0.05)).toHaveLength(4);
  });
});

describe("deltaBands", () => {
  const levels = [
    level(95, { delta: 0.75, iv: 0.3 }, { delta: -0.25, iv: 0.34 }),
    level(100, { delta: 0.5, iv: 0.25 }, { delta: -0.5, iv: 0.26 }),
    level(105, { delta: 0.26, iv: 0.22 }, { delta: -0.74, iv: 0.21 }),
    level(110, { delta: 0.15, iv: 0.24 }, { delta: -0.85, iv: 0.2 }),
  ];

  it("picks the nearest strike to each delta target, per side", () => {
    const rows = deltaBands(levels);
    expect(rows.map((r) => r.target)).toEqual([0.5, 0.25, 0.16]);
    expect(rows[0].callStrike).toBe(100);
    expect(rows[0].putStrike).toBe(100);
    expect(rows[1].callStrike).toBe(105);
    expect(rows[1].putStrike).toBe(95);
    expect(rows[2].callStrike).toBe(110);
  });

  it("returns nulls rather than guesses when the snapshot carries no greeks", () => {
    const rows = deltaBands([level(100, { delta: null }, { delta: null })]);
    expect(rows.every((r) => r.callStrike === null && r.putStrike === null)).toBe(true);
  });
});

describe("dexProfile", () => {
  it("signs dealer delta as calls minus puts and accumulates from the low strike up", () => {
    const levels = [
      level(100, { delta: 0.5, oi: 10 }, { delta: -0.5, oi: 10 }),
      level(105, { delta: 0.3, oi: 10 }, { delta: -0.7, oi: 10 }),
    ];
    const { points, total } = dexProfile(levels, 100, 1);
    // (0.5*10) − (−0.5*10) = +10 at 100; (0.3*10) − (−0.7*10) = +10 at 105.
    expect(points[0].dex).toBeCloseTo(1000); // ×spot 100
    expect(points[1].cumulative).toBeCloseTo(2000);
    expect(total).toBeCloseTo(2000);
  });

  it("interpolates the strike where cumulative dealer delta crosses zero", () => {
    const levels = [
      level(100, { delta: 0, oi: 0 }, { delta: -1, oi: 10 }), // −(−1*10) = +10 … flip below
      level(110, { delta: -1, oi: 20 }, { delta: 0, oi: 0 }),
    ];
    const { flipStrike } = dexProfile(levels, 1, 1);
    expect(flipStrike).not.toBeNull();
    expect(flipStrike!).toBeGreaterThan(100);
    expect(flipStrike!).toBeLessThan(110);
  });

  it("reports no crossing when dealers never go flat in range", () => {
    const levels = [level(100, { delta: 0.5, oi: 10 }, { delta: -0.5, oi: 10 })];
    expect(dexProfile(levels, 100).flipStrike).toBeNull();
  });
});

describe("skew", () => {
  const rows = [
    { strike: 95, call: { iv: 0.2 }, put: { iv: 0.28 } },
    { strike: 100, call: { iv: 0.2 }, put: { iv: 0.23 } },
    { strike: 105, call: { iv: 0.22 }, put: { iv: 0.21 } },
  ];

  it("computes put minus call IV per strike, in sorted order", () => {
    const points = ivSkewProfile([...rows].reverse());
    expect(points.map((p) => p.strike)).toEqual([95, 100, 105]);
    expect(points[0].skew).toBeCloseTo(0.08);
    expect(points[2].skew).toBeCloseTo(-0.01);
  });

  it("takes ATM skew from the strike nearest spot", () => {
    expect(atmSkew(ivSkewProfile(rows), 101)).toBeCloseTo(0.03);
  });

  it("returns null skew when one leg has no IV", () => {
    const points = ivSkewProfile([{ strike: 100, call: { iv: null }, put: { iv: 0.2 } }]);
    expect(points[0].skew).toBeNull();
  });

  it("prices the 25Δ risk reversal off the delta-matched wings", () => {
    const levels = [
      level(95, { delta: 0.75, iv: 0.3 }, { delta: -0.25, iv: 0.34 }),
      level(105, { delta: 0.25, iv: 0.22 }, { delta: -0.75, iv: 0.2 }),
    ];
    expect(deltaSkew(levels)).toBeCloseTo(0.12); // 25Δ put 0.34 − 25Δ call 0.22
  });
});

describe("rankMvc", () => {
  const cheapConvex = level(
    105,
    { mid: 0.5, delta: 0.3, gamma: 0.05, spread_pct: 4, oi: 500 },
    { mid: 5, delta: -0.9, gamma: 0.001, spread_pct: 4, oi: 10 }
  );
  const expensive = level(
    100,
    { mid: 8, delta: 0.55, gamma: 0.01, spread_pct: 4, oi: 900 },
    { mid: 8, delta: -0.45, gamma: 0.01, spread_pct: 4, oi: 900 }
  );

  it("ranks the contract with the most gamma per dollar of premium first", () => {
    const rows = rankMvc([cheapConvex, expensive]);
    expect(rows[0].strike).toBe(105);
    expect(rows[0].side).toBe("call");
    expect(rows[0].gammaPerDollar).toBeCloseTo(0.1);
  });

  it("drops contracts quoting wider than the spread filter", () => {
    const wide = level(
      110,
      { mid: 0.1, delta: 0.1, gamma: 0.09, spread_pct: 40 },
      { mid: 9, delta: -0.95, gamma: 0.001, spread_pct: 40 }
    );
    expect(rankMvc([wide, expensive]).some((r) => r.strike === 110)).toBe(false);
  });

  it("honours the liquid-only filter", () => {
    const illiquid = level(
      105,
      { mid: 0.5, delta: 0.3, gamma: 0.05, liquid: false },
      { mid: 5, delta: -0.9, gamma: 0.001, liquid: false }
    );
    expect(rankMvc([illiquid], { requireLiquid: true })).toHaveLength(0);
    expect(rankMvc([illiquid], { requireLiquid: false }).length).toBeGreaterThan(0);
  });

  it("skips contracts with no mid or no greeks rather than scoring them as zero", () => {
    const broken = level(
      100,
      { mid: null, bid: null, ask: null },
      { mid: 1, delta: null, gamma: null }
    );
    expect(rankMvc([broken])).toHaveLength(0);
  });

  it("names why each contract ranked", () => {
    const rows = rankMvc([cheapConvex, expensive]);
    expect(rows[0].reason).toMatch(/× median Γ\/\$/);
    expect(rows[0].reason).toMatch(/spread/);
  });
});
