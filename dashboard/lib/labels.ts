// dashboard/lib/labels.ts

/** Today/Screener table header glosses (X-06/X-07, TD-05). */
export const HEADER_GLOSS: Record<string, string> = {
  C: "Conviction — model confidence in the call. More filled dots = higher conviction. Display-only, not blended into the composite score.",
  "⚑": "Flags — extended move (ext) and/or an earnings date inside the typical hold window (E{n}d).",
  Cat: "Catalysts — count of named events (earnings, guidance, index changes, etc.) behind the signal. Hover/focus for the list.",
  Sent: "Sentiment leg — X/Twitter chatter score, validated independently of price action.",
  Tech: "Technical leg — ~70-agent ensemble's price/volume-based score.",
  Fund: "Fundamental/catalyst leg — earnings proximity, guidance, and other event-driven inputs.",
  "RS-Ratio": "Relative Strength Ratio (JdK RRG) — the industry's price strength vs. its benchmark, normalized around 100. >100 = outperforming.",
  "RS-Mom": "Relative Strength Momentum (JdK RRG) — the rate of change of RS-Ratio. >100 = the strength trend is accelerating.",
  Breadth: "% of names in the industry basket trading above their 50-day moving average. Improving quadrant + low breadth = one name carrying the move, unconfirmed.",
  n: "Basket size — number of names sampled for the industry's RS/breadth. <20 is shrinkage-adjusted and shown muted.",
  L: "Long votes — number of agents in the ensemble voting long on this ticker.",
  S: "Short votes — number of agents voting short.",
  W: "Wait votes — number of agents voting no direction (wait).",
  Votes: "How the agent ensemble split — long (model purple), short (amber) and wait (grey), in proportion. Hover for the counts.",
  HC: "High conviction — ≥75% of the indicator ensemble agrees and the verdict isn't WAIT. That is consensus, not edge: it says the signals line up, not that the trade is better.",
  "Agree%": "Agreement — share of voting agents aligned with the ensemble's final verdict direction.",
  "R:R": "Risk:reward — modeled target distance divided by modeled stop distance from entry.",
  "◉": "Quadrant — Leading / Improving / Weakening / Lagging (JdK RRG rotation quadrant). Hover/focus the dot for the current quadrant.",
  Δrank: "Change in rank since the prior session. ~72% of ±1-place moves are noise — treat single-step changes with caution.",
};

/** RRG quadrant labels (RotationPanel `QuadrantDot`). */
export const QUADRANT_LABEL: Record<"leading" | "weakening" | "lagging" | "improving", string> = {
  leading: "Leading",
  weakening: "Weakening",
  lagging: "Lagging",
  improving: "Improving",
};

/**
 * What each quadrant word means, in the two axes it is built from: RS-Ratio is
 * strength against the benchmark, RS-Momentum is whether that strength is
 * building or draining. The words alone are jargon — "Weakening" sits on the
 * strong half of the chart, which reads backwards until you know that.
 */
export const QUADRANT_GLOSS: Record<"leading" | "weakening" | "lagging" | "improving", string> = {
  leading: "strong and still gaining",
  improving: "weak, momentum turning up",
  weakening: "strong, momentum rolling over",
  lagging: "weak and still falling",
};

/**
 * Combo code decode (TK-07). Ground truth: `argus/argus/action_card/builder.py`,
 * `_combo_string()` builds a 5-character string, one char per vote family, in
 * fixed order: ma_trend, breakout, squeeze, momentum_osc, weekly_structure.
 * Each char is 'L' (long-dominant), 'S' (short-dominant), or 'N' (no dominant
 * side — mixed/neutral), decided by `_family_dominant()`'s confidence-weighted
 * 1.3x-margin rule. The dashboard (and the backend's own `_WEAK_COMBOS` check,
 * `builder.py` — `combo[:4] not in _WEAK_COMBOS`) only classifies the first 4
 * characters; the 5th (weekly_structure) exists in the raw string but is not
 * part of the STRONG/WEAK classification the dashboard currently uses. This
 * corrects the prior UI copy's guess of "trend/squeeze/oscillator/structure" —
 * the real 2nd position is breakout, not squeeze.
 */
export const COMBO_POSITION_LABEL: [family: string, gloss: string][] = [
  ["ma_trend", "Moving-average trend — price above/below trend MAs."],
  ["breakout", "Breakout — price breaking out of its recent range."],
  ["squeeze", "Volatility squeeze — market compressed ahead of a move."],
  ["momentum_osc", "Momentum oscillator — RSI/Stochastic-style overbought/oversold read."],
];
export const COMBO_LETTER_LABEL: Record<"L" | "S" | "N", string> = {
  L: "Long-dominant",
  S: "Short-dominant",
  N: "Mixed / no dominant side",
};

/** Options ladder header codes (OL-13/OD-06). Ground truth: `app/learn/options/page.tsx`. */
export const LADDER_CODE_LABEL: Record<"SPOT" | "ZG" | "CW" | "PW", string> = {
  SPOT: "Current underlying price — the ladder auto-scrolls to keep this centered.",
  ZG: "Zero-gamma flip — below it dealers are typically short gamma (moves amplify); above it, long gamma (moves dampen).",
  CW: "Call wall — the strike with the heaviest dealer gamma on the call side; acts as resistance.",
  PW: "Put wall — the strike with the heaviest dealer gamma on the put side; acts as support.",
};

/** Option greek symbols + glosses, keyed by `lib/format.ts`'s `GreekKind` (OL-12). */
export const GREEK_LABEL: Record<"delta" | "gamma" | "theta" | "vega" | "rho", { symbol: string; gloss: string }> = {
  delta: { symbol: "Δ", gloss: "Delta — dollar change in option price per $1 move in the underlying." },
  gamma: { symbol: "Γ", gloss: "Gamma — rate of change of delta per $1 move in the underlying." },
  theta: { symbol: "Θ", gloss: "Theta — dollar decay in option price per day, all else equal." },
  vega: { symbol: "ν", gloss: "Vega — dollar change in option price per 1-point move in implied volatility." },
  rho: { symbol: "ρ", gloss: "Rho — dollar change in option price per 1-point move in interest rates." },
};

/** Portfolio "edge" values (PF-08). Ground truth: `argus/argus/portfolio/tracker.py:56-69`. */
export const PORTFOLIO_EDGE_LABEL: Record<string, string> = {
  "HOLD/ADD": "The current Argus verdict agrees with your position direction — hold, or add on strength.",
  "CONSIDER SELLING": "You're long and the current Argus verdict flipped SHORT — the original thesis is being contradicted.",
  "CONSIDER COVERING": "You're short and the current Argus verdict flipped LONG — the original thesis is being contradicted.",
  NEUTRAL: "The current Argus verdict is WAIT — no directional edge either way right now.",
  "N/A": "Not a stock position (option/future/etc.) — Argus's equity verdict doesn't apply.",
  "NO DATA": "Price history is unavailable for this symbol right now — edge can't be computed.",
};

/** Verdict values (Badge variant="verdict", screener/portfolio/ticker). */
export const VERDICT_LABEL: Record<string, string> = {
  LONG: "Ensemble leans long — long-side agents dominate on a confidence-weighted basis.",
  SHORT: "Ensemble leans short — short-side agents dominate on a confidence-weighted basis.",
  WAIT: "No directional lean clears the bar either way.",
};

/** Tier values (Badge variant="tier", screener/today). */
export const TIER_LABEL: Record<string, string> = {
  PRIME_LONG: "Highest-conviction long setup — clears every gate.",
  BREAKOUT_LONG: "Long setup flagged for an active breakout.",
  STANDARD_LONG: "Clears the baseline long bar but isn't prime or breakout-flagged.",
  WATCH: "Below the actionable bar — worth tracking, not yet a call.",
  AVOID: "Setup actively argues against a long position right now.",
  WAIT: "No actionable read in either direction.",
};

/** Watchlist "Still in?" column rename (WL-05) — declarative, not a question. */
export const WATCHLIST_STATUS_LABEL: Record<"in" | "out", string> = {
  in: "Still in setup",
  out: "Setup invalidated",
};
