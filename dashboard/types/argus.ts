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
  note: string;
  family: AgentFamily;
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
  iv_atm_call: number;
  iv_atm_put: number;
  iv_skew: number;
  max_pain: number;
  flags: string[];
  unusual_calls_top: unknown[];
  unusual_puts_top: unknown[];
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
