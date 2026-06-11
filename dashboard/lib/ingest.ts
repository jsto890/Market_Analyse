type CsvRow = Record<string, unknown>;

export interface SignalRecord {
  date: string;
  ticker: string;
  alignment: string | null;
  argus_verdict: string | null;
  combined_score: number | null;
  tech_score: number | null;
  sentiment_score: number | null;
  quality_score: number | null;
  agreement_pct: number | null;
  high_conviction: 0 | 1 | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  risk_reward: number | null;
  entry_quality: string | null;
  stop_anchor: string | null;
  catalysts: string | null;
  ret_1d: number | null;
  ret_5d: number | null;
  ret_20d: number | null;
  ret_126d: number | null;
  ret_252d: number | null;
  conviction: string | null;
  action_label: string | null;
  trade_style: string | null;
  combo: string | null;
  ticker_regime: string | null;
  n_eff: number | null;
  report_group: string | null;
  near_aligned: 0 | 1 | null;
  sector: string | null;
  industry: string | null;
  theme: string | null;
  mentions: number | null;
  accounts: number | null;
  top_accounts: string | null;
  setup_label: string | null;
  next_earnings_date: string | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function bool01(v: unknown): 0 | 1 | null {
  if (v === true || v === 1 || v === "True" || v === "1") return 1;
  if (v === false || v === 0 || v === "False" || v === "0") return 0;
  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function deriveReportGroup(row: CsvRow): string {
  if (row["report_group"] !== undefined && row["report_group"] !== null && row["report_group"] !== "") {
    return String(row["report_group"]);
  }
  const g1 = row["group1"];
  const g2 = row["group2"];
  const conviction = row["conviction"];
  const sentimentScore = num(row["sentiment_score"]);
  if (g1 === true || g1 === 1 || g1 === "True") return "aligned";
  if (
    (g2 === true || g2 === 1 || g2 === "True") &&
    conviction === "high" &&
    sentimentScore !== null &&
    sentimentScore < 0.2
  )
    return "pullback";
  if (g2 === true || g2 === 1 || g2 === "True") return "tech_fund";
  return "other";
}

export function latestPerDay(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of names) {
    const raw = name.slice(7, 15); // "20260610"
    const key = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`; // "2026-06-10"
    const current = map.get(key);
    if (!current || name > current) map.set(key, name);
  }
  return map;
}

export function rowToSignal(row: CsvRow, date: string): SignalRecord | null {
  const combinedScore = num(row["combined_score"]);
  if (combinedScore === null) return null;
  const ticker = str(row["ticker"])?.toUpperCase() ?? null;
  if (!ticker) return null;

  return {
    date,
    ticker,
    alignment: str(row["alignment"]),
    argus_verdict: str(row["argus_verdict"]),
    combined_score: combinedScore,
    tech_score: num(row["tech_score"]),
    sentiment_score: num(row["sentiment_score"]),
    quality_score: num(row["quality_score"]),
    agreement_pct: num(row["agreement_pct"]),
    high_conviction: bool01(row["high_conviction"]),
    entry: num(row["entry"]),
    stop: num(row["stop"]),
    target: num(row["target"]),
    risk_reward: num(row["risk_reward"]),
    entry_quality: str(row["entry_quality"]),
    stop_anchor: str(row["stop_anchor"]),
    catalysts: str(row["catalysts"]),
    ret_1d: num(row["ret_1d"]),
    ret_5d: num(row["ret_5d"]),
    ret_20d: num(row["ret_20d"]),
    ret_126d: num(row["ret_126d"]),
    ret_252d: num(row["ret_252d"]),
    conviction: str(row["conviction"]),
    action_label: str(row["action_label"]),
    trade_style: str(row["trade_style"]),
    combo: str(row["combo"]),
    ticker_regime: str(row["ticker_regime"]),
    n_eff: num(row["n_eff"]),
    report_group: deriveReportGroup(row),
    near_aligned: bool01(row["near_aligned"]),
    sector: str(row["sector"]),
    industry: str(row["industry"]),
    theme: str(row["theme"]),
    mentions: num(row["mentions"]),
    accounts: num(row["accounts"]),
    top_accounts: str(row["top_accounts"]),
    setup_label: str(row["setup_label"]),
    next_earnings_date: str(row["next_earnings_date"]),
  };
}
