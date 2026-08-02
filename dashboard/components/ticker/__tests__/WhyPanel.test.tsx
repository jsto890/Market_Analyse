import { describe, it, expect } from "vitest";
import { render, screen, within } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { makeActionCardData, makeBridgeRow } from "@/test/factories";
import userEvent from "@testing-library/user-event";
import WhyPanel from "@/components/ticker/WhyPanel";
import type { ActionCardData, AgentVote } from "@/types/argus";
import type { BridgeRow } from "@/types/bridge";

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

describe("WhyPanel legs (K-09)", () => {
  function mount(cardOverrides: Partial<ActionCardData>, row: BridgeRow | null) {
    mockFetchJson((url) => {
      if (url === "/api/bridge") return row ? { signals: [row] } : undefined;
      if (url.includes("/action_card/")) return card(cardOverrides);
      return undefined;
    });
    render(<WhyPanel ticker="NVDA" />);
  }

  it("leads with three leg rows, each naming the evidence behind its bar", async () => {
    mount(
      {
        family_votes: {
          ma_trend: { long: 14, short: 1, wait: 3 },
          breakout: { long: 9, short: 2, wait: 2 },
          momentum_osc: { long: 3, short: 6, wait: 4 },
        },
      },
      makeBridgeRow({
        ticker: "NVDA",
        sentiment_score: 0.55,
        mentions: 142,
        accounts: 38,
        vote_growth_profitability: 1,
        vote_analyst_upside: 1,
        vote_event_catalyst: -1,
        vote_squeeze_setup: 0,
        vote_earnings_proximity: 1,
        earnings_in_days: 0,
      })
    );

    // Sentiment leg — mentions/accounts off the bridge row, tone off the score.
    expect(
      await screen.findByText("Positive tone — 142 mentions across 38 accounts.")
    ).toBeInTheDocument();
    // Technical leg — the action card's own family votes, counted and named.
    expect(
      screen.getByText("26 of 44 agents long, led by ma trend and breakout.")
    ).toBeInTheDocument();
    // Fundamental leg — the bridge's catalyst votes and the one earnings fact.
    expect(
      screen.getByText("Growth and analyst upside positive, event negative, earnings today.")
    ).toBeInTheDocument();

    for (const eyebrow of ["SENT", "TECH", "FUND"]) {
      expect(screen.getByText(eyebrow)).toBeInTheDocument();
      expect(screen.getByRole("img", { name: new RegExp(`^${eyebrow} strength`) })).toBeInTheDocument();
    }
  });

  it("renders a leg's bar and label with no sentence when the evidence is missing", async () => {
    mount(
      {},
      makeBridgeRow({
        ticker: "NVDA",
        mentions: 0,
        accounts: 0,
        vote_event_catalyst: 0,
        vote_squeeze_setup: 0,
        vote_growth_profitability: 0,
        vote_analyst_upside: 0,
        vote_earnings_proximity: 0,
        earnings_in_days: null,
      })
    );

    // Both legs still declare themselves; neither invents a sentence.
    expect(await screen.findByRole("img", { name: /^SENT strength/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^FUND strength/ })).toBeInTheDocument();
    expect(screen.queryByText(/mentions across/)).not.toBeInTheDocument();
    expect(screen.queryByText(/positive|negative|earnings/i)).not.toBeInTheDocument();
  });

  it("drops the bridge-fed legs entirely when there is no bridge row", async () => {
    mount({}, null);
    expect(await screen.findByRole("img", { name: /^TECH strength/ })).toBeInTheDocument();
    expect(screen.queryByText("SENT")).not.toBeInTheDocument();
    expect(screen.queryByText("FUND")).not.toBeInTheDocument();
  });

  it("reads the leg combination out as the call it produces", async () => {
    mount(
      { action_label: "STANDARD_LONG", high_conviction: false },
      makeBridgeRow({ ticker: "NVDA", sentiment_score: 0.8, mentions: 12, accounts: 6 })
    );
    expect(
      await screen.findByText(
        /three legs, each with the evidence behind the bar\..*is what "Standard long, not high conviction" looks like\./
      )
    ).toBeInTheDocument();
  });

  it("puts the ensemble telemetry behind a 'How the ensemble voted' disclosure", async () => {
    mount({ n_eff: 12.3, combo: "LSNL" }, null);
    const trigger = await screen.findByRole("button", { name: /how the ensemble voted/i });
    // n_eff, the combo decode and the vote accordion all live under it.
    const region = document.getElementById(trigger.getAttribute("aria-controls")!)!;
    expect(within(region).getByText("n_eff")).toBeInTheDocument();
    expect(within(region).getByText("ma_trend")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: /agent votes/i })).toBeInTheDocument();
  });
});

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
