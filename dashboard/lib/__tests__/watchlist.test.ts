// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWatchlistTickers } from "@/lib/watchlist";
import { mockFetchJson } from "@/test/fetchMock";

describe("useWatchlistTickers", () => {
  it("returns a Set of tickers currently pinned to the watchlist", async () => {
    mockFetchJson({
      "/api/watchlist": {
        watchlist: [
          { ticker: "AAPL", pinned_at: "2026-07-28T00:00:00Z", price_at_pin: 210.5 },
          { ticker: "TSLA", pinned_at: "2026-07-27T00:00:00Z", price_at_pin: 300.1 },
        ],
      },
    });
    const { result } = renderHook(() => useWatchlistTickers());
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.has("AAPL")).toBe(true);
    expect(result.current.has("TSLA")).toBe(true);
  });
});
