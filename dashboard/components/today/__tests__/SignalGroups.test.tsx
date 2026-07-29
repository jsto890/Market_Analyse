import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import { mockFetchJson } from "@/test/fetchMock";
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

  it("does not toggle hcOnly when clicking the InfoTip trigger next to HC only", async () => {
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
    await user.click(screen.getByRole("button", { name: "Conviction filter info" }));

    expect(screen.getByRole("button", { name: "HC only" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("NVDA")).toBeInTheDocument();
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

describe("SignalGroups — row-encoding diet (TD-03/04/05/06)", () => {
  it("shows exactly six main columns with no bare cryptic headers", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      aligned: [row({ ticker: "NVDA" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
    await screen.findByText("NVDA");
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toHaveLength(6);
    expect(screen.queryByRole("columnheader", { name: /^C$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "⚑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Cat" })).not.toBeInTheDocument();
  });

  it("gives the Sent · Tech · Fund header a keyboard-reachable tooltip", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      aligned: [row({ ticker: "NVDA" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    const user = userEvent.setup();
    render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
    await screen.findByText("NVDA");
    // Radix Tooltip.Trigger closes/suppresses on pointerdown (click) by design —
    // it only opens on hover or keyboard focus (see components/ui/__tests__/InfoTip.test.tsx,
    // which tests the same two triggers). Use hover here to actually open it.
    await user.hover(screen.getByRole("button", { name: /Sent · Tech · Fund/i }));
    // Radix renders tooltip content twice (visible + an accessibility copy),
    // same reason components/ui/__tests__/InfoTip.test.tsx uses findAllByText.
    expect((await screen.findAllByText(/all three lit = aligned/)).length).toBeGreaterThan(0);
  });

  it("moves conviction, catalyst count and flags into the expanded row, and renders 1W/6M/1Y as Ret chips", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      aligned: [
        row({
          ticker: "NVDA",
          is_extended: true,
          earnings_in_days: 4,
          catalysts: "Guidance raise; Buyback",
          ret_5d: 2.5,
          ret_126d: -1.1,
          ret_252d: 40.2,
        }),
      ],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    const user = userEvent.setup();
    render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
    await screen.findByText("NVDA");
    // Click the sector cell, not the ticker link — the ticker's <Link> calls
    // stopPropagation() so it navigates instead of toggling the row.
    // Scoped to role "cell" (not screen.getByText) because the sector filter's
    // <select> also renders an <option>Semiconductors</option> with the same
    // text — getByText matches both and throws a multiple-elements error.
    await user.click(screen.getByRole("cell", { name: "Semiconductors" }));
    // conviction, catalyst count and flags are gone from the main row's header set (checked above)
    // and now live under the expanded row's own labels:
    expect(await screen.findByText("Conviction")).toBeInTheDocument();
    expect(screen.getByText("Catalysts")).toBeInTheDocument();
    expect(screen.getByText("Flags")).toBeInTheDocument();
    expect(screen.getByText("+2.5")).toBeInTheDocument();
    expect(screen.getByText("-1.1")).toBeInTheDocument();
    expect(screen.getByText("+40.2")).toBeInTheDocument();
  });
});
