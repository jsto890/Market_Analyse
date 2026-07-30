import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import WatchlistClient from "@/app/watchlist/WatchlistClient";
import UndoToastProvider from "@/components/ui/UndoToastProvider";

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

describe("WatchlistClient row navigation (WL-06)", () => {
  it("pinned row has no anchor tag; clicking calls router.push", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 120 }] },
      "/api/bridge": { signals: [] },
      "/api/signals/recent?days=14": [],
      "/api/signals/dates": [],
    });
    render(
      <UndoToastProvider>
        <WatchlistClient medianDaysToPeak={12} />
      </UndoToastProvider>
    );
    const cell = await screen.findByText("NVDA");
    expect(cell.closest("a")).toBeNull();

    const user = userEvent.setup();
    await user.click(cell.closest("tr")!);

    expect(push).toHaveBeenCalledWith("/t/NVDA");
  });
});

describe("WatchlistClient recent picks age formatting", () => {
  it("renders the Age column through format.relativeAge with a unit suffix", async () => {
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
      "/api/argus/history/MSFT?period=6mo": {
        bars: [{ ts: eightDaysAgo, close: 300 }],
      },
    });

    render(<WatchlistClient medianDaysToPeak={12} />);

    expect(await screen.findByText(/^\d+d$/)).toBeInTheDocument();
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
    render(
      <UndoToastProvider>
        <WatchlistClient medianDaysToPeak={12} />
      </UndoToastProvider>
    );
    await screen.findByText("NVDA");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Unpin" }));
    expect(await screen.findByText("Removed NVDA from watchlist")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("NVDA")).toBeInTheDocument();
  });
});

describe("WatchlistClient reserved column widths (WL-02)", () => {
  it("Now/Since pin header cells fixed width so late-arriving data can't reflow columns", async () => {
    mockFetchJson(baseMocks());
    render(
      <UndoToastProvider>
        <WatchlistClient medianDaysToPeak={12} />
      </UndoToastProvider>
    );
    await screen.findByText("NVDA");
    const nowHeader = screen.getByRole("columnheader", { name: "Now" });
    const sinceHeader = screen.getByRole("columnheader", { name: "Since pin" });
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
    render(
      <UndoToastProvider>
        <WatchlistClient medianDaysToPeak={12} />
      </UndoToastProvider>
    );
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
    render(
      <UndoToastProvider>
        <WatchlistClient medianDaysToPeak={12} />
      </UndoToastProvider>
    );
    await screen.findByText("AMD");
    expect(screen.getByRole("columnheader", { name: "In today's report" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Still in?" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pin price" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Flag price" })).toBeInTheDocument();
  });
});
