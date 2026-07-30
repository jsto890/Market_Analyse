import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@/test/render";
import SourcesTable from "@/components/sources/SourcesTable";
import type { BridgeRow } from "@/types/bridge";

function row(overrides: Partial<BridgeRow> = {}): BridgeRow {
  return {
    ticker: "NVDA",
    fetch_symbol: "NVDA",
    mentions: 12,
    accounts: 3,
    source_score: 0.71,
    top_accounts: "@alpha; @beta",
    ...overrides,
  } as BridgeRow;
}

const rows = [
  row(),
  row({ ticker: "AMD", fetch_symbol: "AMD", mentions: 4, accounts: 1, source_score: 0.2, top_accounts: "@alpha" }),
];

describe("SourcesTable", () => {
  it("shows every ticker by default", () => {
    render(<SourcesTable rows={rows} initialTicker="" />);
    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AMD").length).toBeGreaterThan(0);
  });

  it("seeding initialTicker (from ?ticker=) narrows both tables", () => {
    render(<SourcesTable rows={rows} initialTicker="NVDA" />);
    expect(screen.getByText("Today's tickers (1)")).toBeInTheDocument();
    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@beta").length).toBeGreaterThan(0);
  });

  it("typing into the filter narrows the tickers table", () => {
    render(<SourcesTable rows={rows} initialTicker="" />);
    const input = screen.getByPlaceholderText(/filter by ticker or account/i);
    fireEvent.change(input, { target: { value: "amd" } });
    expect(screen.getByText("Today's tickers (1)")).toBeInTheDocument();
    expect(screen.getAllByText("AMD").length).toBeGreaterThan(0);
  });
});
