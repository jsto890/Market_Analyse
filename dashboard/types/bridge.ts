export type Alignment = "ALIGNED" | "CONTRARIAN" | "DIVERGING" | "TECH_WAIT" | "NEUTRAL";
export type Verdict = "LONG" | "SHORT" | "WAIT" | "NEUTRAL";
export type EntryQuality = "clean" | "extended" | "pullback";
export type Conviction = "high" | "med" | "low" | null;
export type ReportGroup = "aligned" | "pullback" | "tech_fund" | "other";

export interface BridgeRow {
  ticker: string;
  fetch_symbol: string;
  setup_label: string;
  conviction: Conviction;
  quality_score: number;
  cluster_overlap: number;
  cluster_confirmed: boolean;
  cluster_bonus: number;
  source_score: number;
  mentions: number;
  accounts: number;
  catalysts: string | null;
  top_accounts: string | null;
  ret_1d: number | null;
  ret_5d: number | null;
  ret_20d: number | null;
  ret_126d: number | null;
  ret_252d: number | null;
  argus_verdict: Verdict;
  argus_score: number;
  high_conviction: boolean;
  agreement_pct: number;
  long_votes: number;
  short_votes: number;
  wait_votes: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  risk_reward: number | null;
  is_extended: boolean;
  entry_quality: EntryQuality;
  stop_anchor: string;
  sentiment_score: number;
  tech_score: number;
  combined_score: number;
  catalyst_score: number;
  vote_event_catalyst: number;
  vote_earnings_proximity: number;
  vote_squeeze_setup: number;
  vote_growth_profitability: number;
  vote_analyst_upside: number;
  gate_flags: string | null;
  alignment: Alignment;
  action_label: string;
  trade_style: string;
  combo: string;
  ticker_regime: string;
  n_eff: number;
  group1: boolean;
  group2: boolean;
  near_aligned: boolean;
  report_group: ReportGroup | null;
  theme: string | null;
  industry: string | null;
  next_earnings_date: string | null;
  earnings_in_days: number | null;
  extra: string;
}

export const ALIGNMENT_COLOR: Record<Alignment, string> = {
  ALIGNED: "#22c55e",    // green-500
  CONTRARIAN: "#f59e0b", // amber-500
  DIVERGING: "#ef4444",  // red-500
  TECH_WAIT: "#3b82f6",  // blue-500
  NEUTRAL: "#6b7280",    // gray-500
};

export const VERDICT_LABEL: Record<string, string> = {
  LONG: "LONG",
  SHORT: "SHORT",
  WAIT: "WAIT",
  NEUTRAL: "—",
};
