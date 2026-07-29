import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import SignalGroups from "@/components/today/SignalGroups";
import type { BridgeRow } from "@/types/bridge";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function row(overrides: Partial<BridgeRow>): BridgeRow {
  return {
    ticker: "NVDA",
    fetch_symbol: "NVDA",
    setup_label: "",
    conviction: "high",
    quality_score: 0,
    cluster_overlap: 0,
    cluster_confirmed: false,
    cluster_bonus: 0,
    source_score: 0,
    mentions: 10,
    accounts: 5,
    catalysts: null,
    top_accounts: null,
    ret_1d: null,
    ret_5d: null,
    ret_20d: null,
    ret_126d: null,
    ret_252d: null,
    argus_verdict: "LONG",
    argus_score: 0,
    high_conviction: true,
    agreement_pct: 0,
    long_votes: 0,
    short_votes: 0,
    wait_votes: 0,
    entry: null,
    stop: null,
    target: null,
    risk_reward: null,
    is_extended: false,
    entry_quality: "clean",
    stop_anchor: "",
    sentiment_score: 1.2,
    tech_score: 0,
    combined_score: 3.4,
    catalyst_score: 0,
    vote_event_catalyst: 0,
    vote_earnings_proximity: 0,
    vote_squeeze_setup: 0,
    vote_growth_profitability: 0,
    vote_analyst_upside: 0,
    gate_flags: null,
    alignment: "ALIGNED",
    action_label: "",
    trade_style: "",
    combo: "",
    ticker_regime: "",
    n_eff: 0,
    group1: false,
    group2: false,
    near_aligned: false,
    report_group: null,
    theme: null,
    industry: "Semiconductors",
    next_earnings_date: null,
    earnings_in_days: null,
    extra: "",
    ...overrides,
  } as BridgeRow;
}

describe("SignalGroups filter feedback (TD-02)", () => {
  it("keeps the ALIGNED panel visible and explains why filters emptied it", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const groups = {
      aligned: [row({ ticker: "NVDA", high_conviction: false })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);

    await screen.findByText("NVDA");
    await user.click(screen.getByRole("button", { name: /HC only/i }));

    expect(await screen.findByText(/0 shown/)).toBeInTheDocument();
    expect(screen.getByText(/1 hidden by filters/)).toBeInTheDocument();
    expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
  });

  it("renders a plain count when no filter is active", async () => {
    resetLocalStorage();
    const groups = {
      aligned: [row({ ticker: "NVDA" }), row({ ticker: "AVGO" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
    expect(await screen.findByText(/ALIGNED\s+\(2\)/)).toBeInTheDocument();
    expect(screen.queryByText(/hidden by filters/)).not.toBeInTheDocument();
  });
});
