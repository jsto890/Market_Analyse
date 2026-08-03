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

/** The top three rows of a group render as cards; only the rest reach the
 *  table. These outscore the row under test so it lands in the table. */
function fillers(): BridgeRow[] {
  return ["AAA", "BBB", "CCC"].map((t) =>
    row({ ticker: t, fetch_symbol: t, combined_score: 9, industry: "Software" })
  );
}

const SECTORS = ["Semiconductors", "Software"];

describe("SignalGroups filter feedback (TD-02)", () => {
  it("keeps the Aligned tab visible and explains why filters emptied it", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const groups = {
      aligned: [row({ ticker: "NVDA", high_conviction: false })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);

    await screen.findByText("NVDA");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by conviction" }),
      "hc"
    );

    // The tab stays, its count goes to zero, and the panel says where the row went.
    expect(await screen.findByRole("tab", { name: /Aligned\s*0/ })).toBeInTheDocument();
    expect(screen.getByText(/1 hidden by filters/)).toBeInTheDocument();
    expect(screen.getByText("Nothing in this group")).toBeInTheDocument();
    expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
  });

  it("leaves the conviction filter unset until it is chosen, and its InfoTip does not set it", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const groups = {
      aligned: [row({ ticker: "NVDA", high_conviction: false })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);

    await screen.findByText("NVDA");
    await user.click(screen.getByRole("button", { name: "Conviction filter info" }));

    expect(screen.getByRole("combobox", { name: "Filter by conviction" })).toHaveValue("");
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
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    expect(await screen.findByRole("tab", { name: /Aligned\s*2/ })).toBeInTheDocument();
    expect(screen.queryByText(/hidden by filters/)).not.toBeInTheDocument();
  });
});

describe("SignalGroups — cards then table", () => {
  it("reads the top three names as cards and drops the rest into the table", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      aligned: [...fillers(), row({ ticker: "NVDA", entry: 100, stop: 90, target: 130 })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);

    await screen.findByText("NVDA");
    // Three cards, each carrying the levels the table only shows on expand.
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "Open →" })).toHaveLength(3);
    // The fourth name is tabular, not a card.
    expect(screen.getByRole("cell", { name: "Semiconductors" })).toBeInTheDocument();
  });

  it("gives the table's Signal cell plain model text, not a badge per row (T-16)", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      // Every row carries the tier, so the one that lands in the table does too
      // whichever way tierSort orders them.
      aligned: [...fillers(), row({ ticker: "NVDA" })].map((r) => ({
        ...r,
        action_label: "STANDARD_LONG",
      })),
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    await screen.findByText("NVDA");
    const cell = screen.getByRole("cell", { name: "Trending" });
    // Thirty rows of badges is thirty boxes; only Badge carries data-value.
    expect(cell.querySelector("[data-value]")).toBeNull();
  });

  it("leaves the card's reason line out rather than passing catalyst text off as one (T-15)", async () => {
    resetLocalStorage();
    const groups = {
      aligned: [row({ ticker: "NVDA", catalysts: "Guidance raise; Buyback" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    await screen.findByText("NVDA");
    // There is no per-name narrative feed, so the row renders nothing at all.
    expect(screen.queryByText(/Guidance raise/)).not.toBeInTheDocument();
  });
});

describe("SignalGroups — row-encoding diet (TD-03/04/05/06)", () => {
  it("shows exactly six main columns with no bare cryptic headers", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      aligned: [...fillers(), row({ ticker: "NVDA" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    await screen.findByText("NVDA");
    // The trailing disclosure column is sr-only and carries no data, so it is
    // not one of the six a reader has to parse.
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent)
      .filter((t) => t !== "Details");
    expect(headers).toHaveLength(6);
    expect(screen.queryByRole("columnheader", { name: "Comb" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Conv" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Cat" })).not.toBeInTheDocument();
  });

  it("gives the Sent · Tech · Fund header a keyboard-reachable tooltip", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      aligned: [...fillers(), row({ ticker: "NVDA" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    const user = userEvent.setup();
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    await screen.findByText("NVDA");
    // userEvent.hover closes/suppresses Radix tooltips in jsdom — see the note in
    // components/ui/__tests__/InfoTip.test.tsx.
    await user.hover(screen.getByRole("button", { name: "What is Sent · Tech · Fund?" }));
    // Radix renders tooltip content twice (visible + accessibility copy), for the
    // same reason components/ui/__tests__/InfoTip.test.tsx uses findAllByText.
    expect((await screen.findAllByText(/all three lit = aligned/)).length).toBeGreaterThan(0);
  });

  it("moves conviction, catalyst count and flags into the expanded row, and renders 1W/6M/1Y Ret chips", async () => {
    resetLocalStorage();
    mockFetchJson({});
    const groups = {
      aligned: [
        ...fillers(),
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
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    await screen.findByText("NVDA");
    // Expansion has its own disclosure control now — a row click opens the
    // ticker, since the row advertises itself as openable.
    await user.click(screen.getByRole("button", { name: "Show details" }));
    // Conviction, catalyst count and flags are gone from the main row's header
    // set (checked above) and now live under the expanded row's own labels:
    expect(await screen.findByText("Conviction")).toBeInTheDocument();
    expect(screen.getByText("Catalysts")).toBeInTheDocument();
    expect(screen.getByText("Flags")).toBeInTheDocument();
    expect(screen.getByText("+2.5")).toBeInTheDocument();
    expect(screen.getByText("-1.1")).toBeInTheDocument();
    expect(screen.getByText("+40.2")).toBeInTheDocument();
  });
});

describe("SignalGroups — visible caveats (TD-07/TD-14)", () => {
  it("prints the group rationale and the disclaimer as one line above the cards", async () => {
    resetLocalStorage();
    const groups = {
      aligned: [row({ ticker: "NVDA" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    await screen.findByText("NVDA");
    // It used to print above each of the four tables, then once at the foot.
    // T-13 puts it at the head, merged into the group's own rationale, because
    // it qualifies the cards directly below it.
    expect(
      screen.getAllByText(/score magnitude does not predict returns \(r≈0\)/)
    ).toHaveLength(1);
    expect(
      screen.getByText(
        /Sentiment, technical and fundamental all bullish\.\s*Levels are indicative, not orders/
      )
    ).toBeInTheDocument();
  });

  it("explains why a ticker lands in Everything else", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const groups = {
      aligned: [],
      pullback: [],
      tech_fund: [],
      other: [row({ ticker: "XOM", industry: "Energy" })],
    };
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);

    await user.click(screen.getByRole("tab", { name: /Everything else\s*1/ }));
    expect(await screen.findByText(/cleared none of the three bars/)).toBeInTheDocument();
    expect(screen.getByText("XOM")).toBeInTheDocument();
  });
});

describe("SignalGroups history prefetch (TD-08)", () => {
  it("prefetches history on row hover so the fetch has already started by the time the row expands", async () => {
    resetLocalStorage();
    let fetchCount = 0;
    mockFetchJson((url) => {
      if (url.includes("/api/argus/history/")) fetchCount += 1;
      return { bars: [{ close: 10 }, { close: 11 }] };
    });
    // AMD (not NVDA) — historyCache is a page-lifetime module-scope Map shared
    // by every test in this file; an earlier NVDA expand already cached
    // "failed", which would make the hover a no-op cache hit instead of a
    // fresh fetch.
    const groups = {
      aligned: [...fillers(), row({ ticker: "AMD", fetch_symbol: "AMD" })],
      pullback: [],
      tech_fund: [],
      other: [],
    };
    const user = userEvent.setup();
    render(<SignalGroups groups={groups} newTickers={[]} sectors={SECTORS} />);
    await screen.findByText("AMD");
    // Scoped to role "cell" — the sector filter's <select> also renders an
    // <option>Semiconductors</option> with the same text.
    await user.hover(screen.getByRole("cell", { name: "Semiconductors" }));
    expect(fetchCount).toBe(1);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    await screen.findByText("Conviction");
    // A second call would only happen on a fresh (uncached) fetch — the hover already resolved it.
    expect(fetchCount).toBe(1);
  });
});
