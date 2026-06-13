export type AccountTier =
  | "core_alpha"
  | "swing_watchlist"
  | "long_term_research"
  | "sentiment_noise";

export const TIER_LABEL: Record<AccountTier, string> = {
  core_alpha: "Core Alpha",
  swing_watchlist: "Swing Watchlist",
  long_term_research: "Long-Term Research",
  sentiment_noise: "Sentiment Noise",
};

export const TIER_ORDER: AccountTier[] = [
  "core_alpha",
  "swing_watchlist",
  "long_term_research",
  "sentiment_noise",
];

export interface AccountStat {
  account: string;
  account_tier: AccountTier;
  signal_count: number;
  actionable_count: number;
  complete_1d_count: number;
  complete_5d_count: number;
  hit_rate_1d: number | null;
  hit_rate_5d: number | null;
  avg_ret_1d: number | null;
  avg_excess_ret_1d: number | null;
  trust_score: number;
  trust_label: string;
  evidence_status: string;
  top_tickers: string[];
}

export interface AccountsData {
  accounts: AccountStat[];
  by_tier: Record<AccountTier, AccountStat[]>;
  meta?: { path: string; exists: boolean };
}

export interface WatchlistEntry {
  ticker: string;
  pinned_at: string; // ISO timestamp
}
