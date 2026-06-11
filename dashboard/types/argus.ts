export type AgentFamily =
  | "trend"
  | "momentum"
  | "volume"
  | "volatility"
  | "structure"
  | "institutional"
  | "prefilter";

export const FAMILY_LABEL: Record<AgentFamily, string> = {
  trend: "TREN",
  momentum: "MOME",
  volume: "VOLU",
  volatility: "VOLA",
  structure: "STRU",
  institutional: "INST",
  prefilter: "PREF",
};

export const FAMILY_ORDER: AgentFamily[] = [
  "trend",
  "momentum",
  "volume",
  "volatility",
  "structure",
  "institutional",
  "prefilter",
];

export interface AgentVote {
  agent: string;
  verdict: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  note: string | null;
  family: AgentFamily;
}

export interface FamilyVoteCounts {
  long: number;
  short: number;
  wait: number;
}

export interface ActionCardData {
  symbol: string;
  verdict: "LONG" | "SHORT" | "WAIT";
  score: number;
  high_conviction: boolean;
  entry: number;
  stop: number;
  target: number;
  risk_reward: number;
  long_votes: number;
  short_votes: number;
  wait_votes: number;
  agreement_pct: number;
  ret_1d: number | null;
  ret_5d: number | null;
  ret_20d: number | null;
  is_extended: boolean;
  entry_quality: string;
  votes: AgentVote[];
  agreed: string[];
  dissented: string[];
  notes: string;
  // Extended fields from backend to_dict()
  score_ci_lo?: number;
  score_ci_hi?: number;
  inflation_gap?: number;
  family_attribution?: Record<string, number>;
  family_votes?: Record<string, FamilyVoteCounts>;
  ticker_regime?: string;
  n_eff?: number;
  combo?: string;
  trade_style?: string;
  action_label?: string;
  adx_value?: number;
  adx_slope?: string;
  meta_coherence?: number;
  meta_adjustment?: number;
  meta_note?: string;
}

export interface OptionsFlowData {
  symbol: string;
  expiration: string;
  spot: number;
  summary: {
    call_oi: number;
    put_oi: number;
    call_vol: number;
    put_vol: number;
    pcr_oi: number;
    pcr_vol: number;
  };
  iv_atm_call: number | null;
  iv_atm_put: number | null;
  iv_skew: number | null;
  max_pain: number | null;
  flags: string[];
  unusual_calls_top: unknown[];
  unusual_puts_top: unknown[];
}

export interface FundamentalsData {
  symbol: string;
  pe_ratio?: number | null;
  eps_ttm?: number | null;
  revenue_ttm?: number | null;
  market_cap?: number | null;
  analyst_target?: number | null;
  analyst_rating?: string | null;
  short_pct_float?: number | null;
  dtc?: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  iv_rank?: number | null;
  earnings_date?: string | null;
  days_to_earnings?: number | null;
  error?: string;
}

export interface WrittenAnalysis {
  mode: string;
  report: string;
  error?: string;
}

export interface ScreenerResult {
  symbol: string;
  verdict: "LONG" | "SHORT" | "WAIT";
  score: number;
  high_conviction: boolean;
  entry: number;
  stop: number;
  target: number;
  risk_reward: number;
  long_votes: number;
  short_votes: number;
  wait_votes: number;
  agreement_pct: number;
  ret_1d: number | null;
  ret_5d: number | null;
  ret_20d: number | null;
  is_extended: boolean;
  entry_quality: string;
}

export interface AgentInfo {
  name: string;
  family: AgentFamily;
}
