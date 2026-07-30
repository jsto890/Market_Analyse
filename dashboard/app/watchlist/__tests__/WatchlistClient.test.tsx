import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import WatchlistClient from "@/app/watchlist/WatchlistClient";
import UndoToastProvider from "@/components/ui/UndoToastProvider";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

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
