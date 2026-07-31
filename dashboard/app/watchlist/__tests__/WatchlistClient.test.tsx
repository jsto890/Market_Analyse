import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { seedLocalStorage, resetLocalStorage } from "@/test/localStorage";
import WatchlistClient from "@/app/watchlist/WatchlistClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function baseMocks() {
  return {
    "/api/watchlist": { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 120 }] },
    "/api/bridge": { signals: [] },
    "/api/signals/recent?days=14": [],
    "/api/signals/dates": [],
  };
}

describe("WatchlistClient pinned cards (WL-06)", () => {
  it("opens a pinned name from the card's own ticker link", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 120 }] },
      "/api/bridge": { signals: [] },
      "/api/signals/recent?days=14": [],
      "/api/signals/dates": [],
    });
    render(<WatchlistClient medianDaysToPeak={12} />);
    const link = await screen.findByRole("link", { name: "NVDA" });
    expect(link).toHaveAttribute("href", "/t/NVDA");
    // Cards, not rows — the pinned list has no table to sort or click through.
    expect(screen.queryByRole("columnheader", { name: "Since pin" })).not.toBeInTheDocument();
  });

  it("prices the whole pinned list from one batch request", async () => {
    mockFetchJson({
      "/api/watchlist": {
        watchlist: [
          { ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 100 },
          { ticker: "AMD", pinned_at: "2026-07-02", price_at_pin: 100 },
        ],
      },
      "/api/bridge": { signals: [] },
      "/api/signals/recent?days=14": [],
      "/api/signals/dates": [],
      "/api/watchlist/enrich?tickers=NVDA,AMD&signals=1": {
        NVDA: { last: 110, w5: null, m21: null, lastSignal: "2026-07-30" },
        AMD: { last: 90, w5: null, m21: null, lastSignal: null },
      },
    });
    render(<WatchlistClient medianDaysToPeak={12} />);
    expect(await screen.findByText("+10.0%")).toBeInTheDocument();
    expect(screen.getByText("-10.0%")).toBeInTheDocument();
    expect(screen.getByText("Last on a report 2026-07-30")).toBeInTheDocument();
  });

  it("filters the grid from the summary strip's own counts", async () => {
    mockFetchJson({
      "/api/watchlist": {
        watchlist: [
          { ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 100 },
          { ticker: "AMD", pinned_at: "2026-07-02", price_at_pin: 100 },
        ],
      },
      "/api/bridge": { signals: [] },
      "/api/signals/recent?days=14": [],
      "/api/signals/dates": [],
      "/api/watchlist/enrich?tickers=NVDA,AMD&signals=1": {
        NVDA: { last: 110, w5: null, m21: null, lastSignal: null },
        AMD: { last: 90, w5: null, m21: null, lastSignal: null },
      },
    });
    const user = userEvent.setup();
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("+10.0%");

    await user.click(screen.getByRole("button", { name: /down since pin/ }));
    expect(screen.queryByRole("link", { name: "NVDA" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AMD" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /pinned/ }));
    expect(screen.getByRole("link", { name: "NVDA" })).toBeInTheDocument();
  });
});

describe("WatchlistClient recent picks window progress", () => {
  it("reads the pick's age against the cohort's median days to peak", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/bridge": { signals: [] },
      "/api/signals/recent?days=14": [
        {
          ticker: "MSFT",
          first_date: eightDaysAgo,
          first_group: "aligned",
          entry_at_flag: 300,
          last_date: eightDaysAgo,
        },
      ],
      "/api/signals/dates": [{ date: eightDaysAgo }],
      "/api/watchlist/enrich?tickers=MSFT": { MSFT: { last: 300, w5: null, m21: null } },
    });

    render(<WatchlistClient medianDaysToPeak={12} />);

    expect(await screen.findByText("8d / ~12d")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Age" })).not.toBeInTheDocument();
  });

  it("says a pick is past the window rather than showing a full bar", async () => {
    const longAgo = new Date(Date.now() - 13 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/bridge": { signals: [] },
      "/api/signals/recent?days=14": [
        { ticker: "MSFT", first_date: longAgo, first_group: "aligned", entry_at_flag: 300, last_date: longAgo },
      ],
      "/api/signals/dates": [{ date: longAgo }],
    });

    render(<WatchlistClient medianDaysToPeak={7} />);

    expect(await screen.findByText("past ~7d")).toBeInTheDocument();
  });
});

describe("WatchlistClient unpin undo (WL-01)", () => {
  it("shows an undo toast after unpinning, and Undo restores the row", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 120 }] },
      "/api/bridge": { signals: [] },
      "/api/signals/recent?days=14": [],
      "/api/signals/dates": [],
    });
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("NVDA");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Unpin" }));
    expect(await screen.findByText("Removed NVDA from watchlist")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("NVDA")).toBeInTheDocument();
  });
});

describe("WatchlistClient reserved column widths (WL-02)", () => {
  it("Now/Since flag header cells fixed width so late-arriving data can't reflow columns", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/signals/recent?days=14": [
        { ticker: "AMD", first_date: "2026-07-15", first_group: "prime", entry_at_flag: 140, last_date: "2026-07-20" },
      ],
    });
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("AMD");
    const nowHeader = screen.getByRole("columnheader", { name: "Now" });
    const sinceHeader = screen.getByRole("columnheader", { name: "Since flag" });
    expect(nowHeader).toHaveStyle({ width: "76px" });
    expect(sinceHeader).toHaveStyle({ width: "88px" });
  });
});

describe("WatchlistClient Context column removal (WL-03)", () => {
  it("shows typical-peak text once in panel subtitle, not per row", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/signals/recent?days=14": [
        { ticker: "AMD", first_date: "2026-07-15", first_group: "prime", entry_at_flag: 140, last_date: "2026-07-20" },
      ],
    });
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("AMD");
    expect(screen.getByText(/typical peak ~12d/)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Context" })).not.toBeInTheDocument();
  });
});

describe("WatchlistClient add-ticker feedback (WL-04)", () => {
  it("shows an inline confirmation with the pinned price on success", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/watchlist": { watchlist: [], price_at_pin: 123.45 },
    });
    const user = userEvent.setup();
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByPlaceholderText("Add ticker…");

    await user.type(screen.getByPlaceholderText("Add ticker…"), "ZZZZ");
    await user.click(screen.getByRole("button", { name: "Pin" }));

    expect(await screen.findByText(/pinned @/)).toBeInTheDocument();
  });

  it("keeps a failed-add error visible across a keystroke, until dismissed", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/watchlist": { watchlist: [] },
    });
    const user = userEvent.setup();
    render(<WatchlistClient medianDaysToPeak={12} />);
    const input = await screen.findByPlaceholderText("Add ticker…");

    vi.mocked(fetch).mockImplementationOnce(async () =>
      new Response(JSON.stringify({ error: "Ticker not found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    await user.type(input, "ZZZZ");
    await user.click(screen.getByRole("button", { name: "Pin" }));
    expect(await screen.findByText("Ticker not found")).toBeInTheDocument();

    await user.type(input, "X");
    expect(screen.getByText("Ticker not found")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByText("Ticker not found")).not.toBeInTheDocument();
  });
});

describe("WatchlistClient declarative headers (WL-05)", () => {
  it("uses declarative header text and status labels, not a question with yes/dropped", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/signals/recent?days=14": [
        { ticker: "AMD", first_date: "2026-07-15", first_group: "prime", entry_at_flag: 140, last_date: "2026-07-20" },
      ],
    });
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("AMD");
    expect(screen.getByRole("columnheader", { name: "In today's report" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Still in?" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Flag price" })).toBeInTheDocument();
  });
});

describe("WatchlistClient legacy migration (WL-07)", () => {
  it("announces the migration once, then never mentions it again", async () => {
    resetLocalStorage();
    seedLocalStorage("argus_watchlist", [{ ticker: "TSLA" }]);
    mockFetchJson({
      ...baseMocks(),
      "/api/watchlist": { watchlist: [] },
    });
    const { unmount } = render(<WatchlistClient medianDaysToPeak={12} />);
    expect(await screen.findByText(/Migrated 1 of 1 ticker/)).toBeInTheDocument();
    expect(window.localStorage.getItem("argus_watchlist")).toBeNull();
    expect(window.localStorage.getItem("dash:watchlist:migration-result")).not.toBeNull();
    unmount();

    // A one-time event gets a transient toast, not page furniture that has to
    // be dismissed on every later visit.
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByPlaceholderText("Add ticker…");
    expect(screen.queryByText(/Migrated 1 of 1 ticker/)).not.toBeInTheDocument();
  });
});

describe("WatchlistClient loading vocabulary (WL-08)", () => {
  it("renders a Loading rows skeleton, not plain Loading text, while recent picks are in flight", async () => {
    // mockFetchJson's object form JSON.stringifies each value, so a function
    // value here would not actually hang — stub fetch directly, delegating
    // every other URL to the classic mock, so only recent-picks stays pending.
    mockFetchJson(baseMocks());
    const classicFetch = global.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/signals/recent")) return new Promise(() => {});
        return classicFetch(input);
      })
    );
    render(<WatchlistClient medianDaysToPeak={12} />);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
