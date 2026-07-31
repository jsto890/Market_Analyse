// dashboard/lib/eventMeta.ts
//
// The meaning layer for the economic calendar (MAC-02/MAC-03). The calendar
// store answers "what is scheduled and when"; this answers "what it measures,
// why it matters now, and what a beat or a miss actually moves".
//
// Ground truth for the event names: `config/econ_calendar_2026.yaml` (six
// curated releases) plus the rule-generated weekly claims in
// `argus/argus/calendar/seed.py`. Earnings rows come from
// `argus/argus/calendar/earnings.py` and carry a ticker instead.

export interface EventMeta {
  /** Short display name — the raw event string is often parenthesised boilerplate. */
  short: string;
  /** One sentence: what the print actually measures. */
  measures: string;
  /** Why this release matters in the current cycle. */
  whyNow: string;
  /** Transmission chain on a hot print (above consensus). */
  beat: string;
  /** Transmission chain on a cold print (below consensus). */
  miss: string;
  /** Sector families that move first, in `sector_taxonomy` naming where possible. */
  sectors: string[];
  /** Bellwether tickers to watch around the print. */
  tickers: string[];
}

/**
 * Matched in order — first regex whose pattern hits the event name wins, so
 * put the specific patterns above the generic ones.
 */
const RULES: [RegExp, EventMeta][] = [
  [
    /fomc|rate decision|powell/i,
    {
      short: "FOMC decision",
      measures:
        "The Fed's target range for the federal funds rate, plus the statement and (on quarterly meetings) the dot plot of where officials expect rates to go.",
      whyNow:
        "The policy rate is the discount rate under every valuation on the screen. The decision itself is usually priced; the statement language and the dots are what re-rate the curve.",
      beat:
        "Hawkish surprise (higher-for-longer) → front-end yields up → long-duration multiples compress first → growth/tech and unprofitable small caps underperform, banks and cash-rich value hold up better.",
      miss:
        "Dovish surprise (cuts pulled forward) → yields down, dollar softer → long-duration and rate-sensitive names (tech, biotech, homebuilders, REITs) lead; financials' net-interest-margin story weakens.",
      sectors: ["AI / Compute", "Financials", "Real Estate", "Consumer"],
      tickers: ["SPY", "QQQ", "IWM", "TLT"],
    },
  ],
  [
    /\bcpi\b|consumer price/i,
    {
      short: "CPI",
      measures:
        "Month-over-month and year-over-year change in a fixed basket of consumer prices. Core CPI strips food and energy — that is the series the Fed's reaction function tracks.",
      whyNow:
        "Core inflation's path decides whether the Fed's next move is a cut or a pause. It is the single highest-variance scheduled print for index-level volatility.",
      beat:
        "Hot core → rate-cut odds fall → real yields up, dollar up → multiple compression hits the longest-duration equities hardest; energy and staples relatively defensive.",
      miss:
        "Cool core → cut odds rise → yields and dollar down → broad risk-on, with small caps and rate-sensitive cyclicals typically leading the bounce.",
      sectors: ["AI / Compute", "Consumer", "Real Estate", "Energy"],
      tickers: ["SPY", "QQQ", "IWM", "TLT"],
    },
  ],
  [
    /employment situation|nonfarm|\bnfp\b/i,
    {
      short: "Employment Situation (NFP)",
      measures:
        "Net new payroll jobs, the unemployment rate, and average hourly earnings for the prior month — the broadest monthly read on the labour market.",
      whyNow:
        "Wage growth is the inflation channel the Fed can least ignore, and payrolls are the cleanest signal on whether growth is decelerating into a slowdown or holding.",
      beat:
        "Strong payrolls + hot wages → growth good, but cuts pushed out → cyclicals and financials outperform while long-duration lags; a very hot print flips it to risk-off on the rates channel.",
      miss:
        "Weak payrolls → recession odds and cut odds both rise → bonds rally hard; equities split — defensives and duration up, cyclicals and small caps down on the earnings channel.",
      sectors: ["Financials", "Industrials", "Consumer"],
      tickers: ["SPY", "IWM", "XLF", "TLT"],
    },
  ],
  [
    /jobless claims/i,
    {
      short: "Jobless claims",
      measures:
        "New filings for unemployment insurance in the past week, plus continuing claims. The highest-frequency labour reading available.",
      whyNow:
        "Weekly cadence makes it the early-warning line on labour-market cracks between monthly payroll prints. Single weeks are noisy; the four-week average is the signal.",
      beat:
        "Claims lower than expected (labour tight) → resilient growth, fewer cuts priced → mild support for cyclicals, mild headwind for duration.",
      miss:
        "Claims spiking, especially a rising four-week average → slowdown narrative → bonds bid, consumer-discretionary and small-cap credit-sensitive names underperform.",
      sectors: ["Consumer", "Industrials"],
      tickers: ["SPY", "IWM"],
    },
  ],
  [
    /\bppi\b|producer price/i,
    {
      short: "PPI",
      measures:
        "Prices received by domestic producers — inflation one step upstream of the consumer basket. Components feed directly into the PCE calculation.",
      whyNow:
        "Read as a leading edge on CPI and as a margin signal: producer prices rising faster than consumer prices squeezes corporate gross margins.",
      beat: "Hot PPI → upstream cost pressure → margin risk for goods manufacturers and retailers; raises the bar for the next CPI print.",
      miss: "Cool PPI → disinflation confirmed upstream → supportive for margins and for the cut path.",
      sectors: ["Industrials", "Consumer", "Materials"],
      tickers: ["SPY", "XLI"],
    },
  ],
  [
    /personal income|\bpce\b/i,
    {
      short: "PCE (Fed's preferred gauge)",
      measures:
        "Household income, spending, and the PCE price index. Core PCE is the inflation measure the Fed's 2% target is actually written against.",
      whyNow:
        "CPI moves the tape harder, but core PCE is what the target is defined on — a divergence between the two is where policy surprises come from.",
      beat: "Hot core PCE → target looks further away → cut odds fall, real yields up → same duration-compression chain as a hot CPI, usually with less intraday violence.",
      miss: "Cool core PCE → target in reach → cut odds rise, curve bull-steepens → broad equity support led by duration.",
      sectors: ["AI / Compute", "Consumer", "Real Estate"],
      tickers: ["SPY", "QQQ", "TLT"],
    },
  ],
  [
    /\bgdp\b/i,
    {
      short: "GDP",
      measures:
        "Total output of the US economy for the quarter, annualised, with a price deflator. Released in advance, second, and third estimates.",
      whyNow:
        "Backward-looking, so it rarely moves the tape alone — its job is confirming or breaking the growth narrative the forward-looking data has already set.",
      beat: "Above-consensus growth → soft-landing narrative → cyclicals, industrials and financials lead; duration lags on fewer cuts.",
      miss: "Below-consensus growth, especially with a weak consumer component → hard-landing risk → defensives and bonds bid, cyclicals sold.",
      sectors: ["Industrials", "Financials", "Consumer"],
      tickers: ["SPY", "IWM", "XLI"],
    },
  ],
];

const EARNINGS_META: EventMeta = {
  short: "Earnings",
  measures:
    "Quarterly results and, more importantly, forward guidance for the company's own revenue and margin path.",
  whyNow:
    "Single-name event risk. Implied volatility is elevated into the print and collapses out of it, so options positions lose value on the vol crush even when the direction is right.",
  beat: "Beat plus raised guidance → gap up, and read-through to suppliers and peers in the same supply chain.",
  miss: "Miss or cut guidance → gap down, with the sharpest damage where the multiple already assumed the guidance.",
  sectors: [],
  tickers: [],
};

/** Meaning entry for a calendar event, or null when it isn't one we explain. */
export function eventMeta(event: string, category?: string | null, ticker?: string | null): EventMeta | null {
  if (ticker || category === "earnings") {
    return { ...EARNINGS_META, short: `${ticker ?? event} earnings`, tickers: ticker ? [ticker] : [] };
  }
  for (const [pattern, meta] of RULES) {
    if (pattern.test(event)) return meta;
  }
  return null;
}

/** Display name that drops the parenthetical boilerplate when we recognise the event. */
export function eventShortName(event: string, category?: string | null, ticker?: string | null): string {
  return eventMeta(event, category, ticker)?.short ?? event;
}

export const CATEGORY_LABEL: Record<string, string> = {
  fomc: "Policy",
  inflation: "Inflation",
  jobs: "Labour",
  growth: "Growth",
  earnings: "Earnings",
};

export const IMPORTANCE_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
