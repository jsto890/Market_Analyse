export type Alignment = "ALIGNED" | "CONTRARIAN" | "DIVERGING" | "TECH_WAIT" | "NEUTRAL";
export type Verdict = "LONG" | "SHORT" | "WAIT" | "NEUTRAL";
export type EntryQuality = "clean" | "extended" | "pullback";

export interface BridgeRow {
  ticker: string;
  fetch_symbol: string;
  setup_label: string;
  quality_score: number;
  cluster_overlap: number;
  cluster_confirmed: boolean;
  cluster_bonus: number;
  source_score: number;
  mentions: number;
  accounts: number;
  catalysts: string;
  top_accounts: string;
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
  entry: number;
  stop: number;
  target: number;
  risk_reward: number;
  is_extended: boolean;
  entry_quality: EntryQuality;
  stop_anchor: string;
  sentiment_score: number;
  tech_score: number;
  combined_score: number;
  alignment: Alignment;
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
