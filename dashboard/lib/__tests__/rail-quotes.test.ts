// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { mockFetchJson } from "@/test/fetchMock";
import { useRailQuotes } from "@/lib/rail-quotes";

function freshCache({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

describe("useRailQuotes", () => {
  it("tracks updatedAt via wall-clock Date.now() on fetch success (G-07)", async () => {
    mockFetchJson({
      "/api/argus/rail/quotes": {
        quotes: [{ symbol: "SPY", price: 500, change_pct: 0.1, group: "indices" }],
        groups: { futures: [], indices: ["SPY"], forex: [] },
        error: null,
      },
    });

    const before = Date.now();
    const { result } = renderHook(() => useRailQuotes(), { wrapper: freshCache });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
