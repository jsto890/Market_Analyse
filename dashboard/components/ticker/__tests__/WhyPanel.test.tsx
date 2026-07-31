import { describe, it, expect } from "vitest";
import { render, screen, within } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { makeActionCardData } from "@/test/factories";
import userEvent from "@testing-library/user-event";
import WhyPanel from "@/components/ticker/WhyPanel";
import type { ActionCardData, AgentVote } from "@/types/argus";

function vote(overrides: Partial<AgentVote> = {}): AgentVote {
  return { agent: "trend_follower_1", verdict: "LONG", confidence: 0.8, note: null, family: "trend", ...overrides } as AgentVote;
}

function card(overrides: Partial<ActionCardData> = {}): ActionCardData {
  return {
    symbol: "NVDA",
    verdict: "LONG",
    score: 0.72,
    high_conviction: true,
    entry: 100,
    stop: 95,
    target: 115,
    risk_reward: 3,
    long_votes: 2,
    short_votes: 1,
    wait_votes: 0,
    agreement_pct: 0.67,
    ret_1d: null,
    ret_5d: null,
    ret_20d: null,
    is_extended: false,
    entry_quality: "clean",
    votes: [
      vote({ agent: "trend_follower_1", verdict: "LONG", family: "trend" }),
      vote({ agent: "trend_follower_2", verdict: "LONG", family: "trend" }),
      vote({ agent: "mean_reversion_1", verdict: "SHORT", family: "momentum", note: "overbought on daily RSI, expecting pullback soon" }),
    ],
    agreed: ["trend_follower_1", "trend_follower_2"],
    dissented: ["mean_reversion_1"],
    notes: "",
    combo: "LNSL",
    ...overrides,
  } as ActionCardData;
}

describe("WhyPanel", () => {
  it("renders the n_eff info tip via the shared InfoTip primitive, not the old inline tooltip", async () => {
    mockFetchJson({
      "/api/argus/action_card/NVDA": makeActionCardData({ symbol: "NVDA", n_eff: 12.3 }),
    });
    render(<WhyPanel ticker="NVDA" />);
    expect(await screen.findByRole("button", { name: /n_eff info/i })).toBeInTheDocument();
  });
});

describe("WhyPanel (TK-05/06/07)", () => {
  it("shows a labelled amber row instead of a bare info glyph when inflation_gap is high", async () => {
    mockFetchJson(() => card({ inflation_gap: 0.3 }));
    render(<WhyPanel ticker="NVDA" />);
    expect(await screen.findByText(/correlated consensus, discount this score/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "info" })).not.toBeInTheDocument();
  });

  it("splits the votes accordion into Dissented (first) and Agreed (second), grouped by family", async () => {
    mockFetchJson(() => card());
    render(<WhyPanel ticker="NVDA" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /agent votes/i }));

    const headings = screen.getAllByText(/^(Dissented|Agreed)$/);
    expect(headings.map((h) => h.textContent)).toEqual(["Dissented", "Agreed"]);

    const dissentedSection = headings[0].closest("div")!;
    expect(within(dissentedSection).getByText("mean_reversion_1")).toBeInTheDocument();
    expect(within(dissentedSection).queryByText("trend_follower_1")).not.toBeInTheDocument();
  });

  it("decodes the combo positionally even when it has no COMBO_NOTE gloss", async () => {
    mockFetchJson(() => card({ combo: "LNSL" })); // not one of the 5 known COMBO_NOTE prefixes
    render(<WhyPanel ticker="NVDA" />);
    expect(await screen.findByText("ma_trend")).toBeInTheDocument();
    expect(screen.getByText("breakout")).toBeInTheDocument();
    expect(screen.getByText("squeeze")).toBeInTheDocument();
    expect(screen.getByText("momentum_osc")).toBeInTheDocument();
  });

  it("links the combo-decode info-tip into the glossary", async () => {
    const user = userEvent.setup();
    mockFetchJson({ [`/api/argus/action_card/AAPL`]: card({ combo: "LSNL" }) });
    render(<WhyPanel ticker="AAPL" />);
    const trigger = (await screen.findByText("ma_trend")).closest("button");
    await user.hover(trigger as HTMLElement);
    const links = await screen.findAllByText("Glossary ↗");
    expect(links[0]).toHaveAttribute("href", "/learn/glossary#ma-trend");
  });
});
