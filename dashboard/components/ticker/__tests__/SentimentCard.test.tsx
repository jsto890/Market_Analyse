import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import SentimentCard from "@/components/ticker/SentimentCard";
import type { BridgeRow } from "@/types/bridge";

function makeBridgeRow(overrides: Partial<BridgeRow> = {}): BridgeRow {
  return {
    ticker: "AAPL",
    fetch_symbol: "AAPL",
    setup_label: "aligned",
    conviction: "high",
    quality_score: 0.8,
    cluster_overlap: 0,
    cluster_confirmed: false,
    cluster_bonus: 0,
    source_score: 0.5,
    mentions: 12,
    accounts: 6,
    catalysts: null,
    top_accounts: null,
    ret_1d: null,
    ret_5d: null,
    ret_20d: null,
    ret_126d: null,
    ret_252d: null,
    argus_verdict: "LONG",
    argus_score: 0.7,
    high_conviction: true,
    agreement_pct: 0.6,
    long_votes: 5,
    short_votes: 1,
    wait_votes: 0,
    entry: null,
    stop: null,
    target: null,
    risk_reward: null,
    is_extended: false,
    entry_quality: "clean",
    stop_anchor: "",
    sentiment_score: 0.42,
    tech_score: 0.5,
    combined_score: 0.5,
    catalyst_score: 0,
    vote_event_catalyst: 0,
    vote_earnings_proximity: 0,
    vote_squeeze_setup: 0,
    vote_growth_profitability: 0,
    vote_analyst_upside: 0,
    gate_flags: null,
    alignment: "ALIGNED",
    action_label: "LONG",
    trade_style: "swing",
    combo: "LLNN",
    ticker_regime: "trend",
    n_eff: 8,
    group1: true,
    group2: false,
    near_aligned: true,
    report_group: "aligned",
    theme: null,
    industry: null,
    next_earnings_date: null,
    earnings_in_days: null,
    extra: "",
    ...overrides,
  };
}

describe("SentimentCard score bar", () => {
  it("renders the sentiment score as a 100px CenterBar with its value label", () => {
    render(<SentimentCard bridgeRow={makeBridgeRow({ sentiment_score: 0.42 })} lastSeen={null} />);
    expect(screen.getByText("+0.42")).toBeInTheDocument();
    const track = screen.getByText("+0.42").previousElementSibling;
    expect(track).toHaveStyle({ width: "100px" });
  });
});
