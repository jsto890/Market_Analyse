import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import WatchlistClient from "@/app/watchlist/WatchlistClient";

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
