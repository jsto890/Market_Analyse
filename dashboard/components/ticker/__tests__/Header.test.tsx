import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import Header from "@/components/ticker/Header";
import UndoToastProvider from "@/components/ui/UndoToastProvider";
import type { BridgeRow } from "@/types/bridge";

function withProvider(ui: React.ReactNode) {
  return <UndoToastProvider>{ui}</UndoToastProvider>;
}

function bridgeRow(overrides: Partial<BridgeRow> = {}): BridgeRow {
  return {
    ticker: "NVDA",
    action_label: "PRIME_LONG",
    argus_verdict: "LONG",
    trade_style: "MOMENTUM",
    conviction: "high",
    high_conviction: true,
    earnings_in_days: null,
    ...overrides,
  } as unknown as BridgeRow;
}

beforeEach(() => {
  mockFetchJson(() => ({}));
});

describe("Header badge row (TK-04)", () => {
  it("shows one consolidated badge (tier) plus a caveat line, not three separate badges", () => {
    render(
      withProvider(
        <Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />
      )
    );
    expect(screen.getByText("PRIME_LONG")).toBeInTheDocument();
    expect(screen.queryByText("LONG")).not.toBeInTheDocument();
    expect(screen.queryByText("MOMENTUM")).not.toBeInTheDocument();
    expect(
      screen.getByText(/consensus, not edge/i)
    ).toBeInTheDocument();
  });

  it("falls back to the verdict badge for SHORT, which the tier scale has no color for", () => {
    render(
      withProvider(
        <Header
          ticker="NVDA"
          bridgeRow={bridgeRow({ action_label: "AVOID", argus_verdict: "SHORT", trade_style: "MOMENTUM" })}
          signalHistory={[]}
          lastClose={null}
        />
      )
    );
    expect(screen.getByText("SHORT")).toBeInTheDocument();
    expect(screen.queryByText("AVOID")).not.toBeInTheDocument();
  });
});
