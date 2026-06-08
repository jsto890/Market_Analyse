export interface SetupStat {
  setup: string;
  count: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  avg_rr: number | null;
  expectancy: number | null; // avg_rr * win_rate + (avg_loss_rr * loss_rate)
  total_pnl: number;
}

export interface SideStat {
  count: number;
  wins: number;
  win_rate: number | null;
  avg_rr: number | null;
  total_pnl: number;
}

export interface EquityPoint {
  ts: string;
  pnl: number;         // trade P&L
  running_pnl: number; // cumulative
  symbol: string;
  setup: string;
}

export interface ScorecardData {
  by_setup: SetupStat[];
  by_side: { LONG: SideStat; SHORT: SideStat };
  equity_curve: EquityPoint[];
  max_drawdown: number;     // largest peak-to-trough in running_pnl
  total_closed: number;
  total_wins: number;
  overall_win_rate: number | null;
  overall_avg_rr: number | null;
  overall_expectancy: number | null;
  total_pnl: number;
}
