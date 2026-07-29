import { describe, it, expect } from "vitest";
import { splitAccounts, aggregateAccounts } from "@/lib/sources";
import type { BridgeRow } from "@/types/bridge";

function row(overrides: Partial<BridgeRow> = {}): BridgeRow {
  return { ticker: "NVDA", top_accounts: "@alpha; @beta", ...overrides } as BridgeRow;
}

describe("splitAccounts", () => {
  it("splits on ';', trims, and drops empties", () => {
    expect(splitAccounts(" @alpha ; @beta ;; ")).toEqual(["@alpha", "@beta"]);
  });
  it("returns [] for null", () => {
    expect(splitAccounts(null)).toEqual([]);
  });
});

describe("aggregateAccounts", () => {
  it("counts each account once per distinct ticker, sorted by breadth desc then handle", () => {
    const rows = [
      row({ ticker: "NVDA", top_accounts: "@alpha; @beta" }),
      row({ ticker: "AMD", top_accounts: "@alpha" }),
      row({ ticker: "MSFT", top_accounts: "@beta; @gamma" }),
    ];
    expect(aggregateAccounts(rows)).toEqual([
      { handle: "@alpha", tickerCount: 2, tickers: ["AMD", "NVDA"] },
      { handle: "@beta", tickerCount: 2, tickers: ["MSFT", "NVDA"] },
      { handle: "@gamma", tickerCount: 1, tickers: ["MSFT"] },
    ]);
  });

  it("does not double-count an account mentioned twice for the same ticker", () => {
    const rows = [row({ ticker: "NVDA", top_accounts: "@alpha; @alpha" })];
    expect(aggregateAccounts(rows)).toEqual([{ handle: "@alpha", tickerCount: 1, tickers: ["NVDA"] }]);
  });
});
