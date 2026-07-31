import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import Header from "@/components/ticker/Header";
import type { BridgeRow } from "@/types/bridge";

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

/** ISO date `d` days from today, UTC — the basis the header counts on. */
function isoIn(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

beforeEach(() => {
  mockFetchJson(() => ({}));
});

describe("Header badge row (TK-04)", () => {
  it("shows one consolidated badge (tier), not three separate badges", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(screen.getByText("Prime long")).toBeInTheDocument();
    expect(screen.queryByText("Long")).not.toBeInTheDocument();
    expect(screen.queryByText("MOMENTUM")).not.toBeInTheDocument();
  });

  it("falls back to the verdict badge for SHORT, which the tier scale has no color for", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow({ action_label: "AVOID", argus_verdict: "SHORT", trade_style: "MOMENTUM" })}
        signalHistory={[]}
        lastClose={null}
      />
    );
    expect(screen.getByText("Short")).toBeInTheDocument();
    expect(screen.queryByText("Avoid")).not.toBeInTheDocument();
  });

  it("renders the tier as display copy, keeping the raw enum in the title (TH-02)", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow({ action_label: "STANDARD_LONG" })} signalHistory={[]} lastClose={null} />);
    const badge = screen.getByText("Standard long");
    expect(badge).toHaveAttribute("title", "STANDARD_LONG");
    expect(screen.queryByText("STANDARD_LONG")).not.toBeInTheDocument();
  });
});

describe("Header glossary and prices (TH-01, TH-04, TH-05)", () => {
  it("moves the HC glossary off the page body onto the chip that needs it (TH-01)", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(screen.queryByText(/consensus, not edge/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /what hc means/i })).toBeInTheDocument();
  });

  it("prices the call off the same number it prints, and names its basis (TH-04)", async () => {
    mockFetchJson({ "/api/argus/quote/NVDA": { symbol: "NVDA", price: 110, change: 1, change_pct: 1 } });
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: "2026-07-01", report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={90}
      />
    );
    expect(await screen.findByText("live")).toBeInTheDocument();
    // +10% off the live 110, not -10% off the stale 90 close.
    expect(screen.getByText(/\+10\.0%/)).toBeInTheDocument();
  });

  it("falls back to the last close and says so when there is no quote (TH-04)", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: "2026-07-01", report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={90}
      />
    );
    expect(screen.getByText("last close")).toBeInTheDocument();
  });

  it("splits this call from the cohort base rate instead of welding them (TH-05)", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: "2026-07-01", report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={110}
      />
    );
    expect(screen.getByText("This call")).toBeInTheDocument();
    expect(screen.getByText("Cohort")).toBeInTheDocument();
  });
});

describe("Header earnings and identity (TH-03, TH-08)", () => {
  it("counts down from the catalysts date, the same source the strip reads (TH-03)", async () => {
    const date = isoIn(1);
    mockFetchJson({
      "/api/argus/catalysts/NVDA": { next_earnings: date, last_earnings: null, analyst: [] },
    });
    render(
      <Header ticker="NVDA" bridgeRow={bridgeRow({ earnings_in_days: 9 } as Partial<BridgeRow>)} signalHistory={[]} lastClose={null} />
    );
    expect(await screen.findByText(/earnings tomorrow/)).toBeInTheDocument();
    expect(screen.queryByText(/earnings in 9d/)).not.toBeInTheDocument();
  });

  it("shows sector, cap, volume vs ADV and the 52-week range (TH-08)", async () => {
    mockFetchJson({
      "/api/argus/quote/NVDA": { symbol: "NVDA", price: 150, change: 1, change_pct: 1 },
      "/api/argus/fundamentals/NVDA": {
        symbol: "NVDA",
        name: "NVIDIA Corp",
        sector: "Technology",
        industry: "Semiconductors",
        market_cap: 3_400_000_000_000,
        volume: 300_000_000,
        avg_volume: 200_000_000,
        week52_high: 200,
        week52_low: 100,
      },
    });
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(await screen.findByText("Technology")).toBeInTheDocument();
    expect(screen.getByText("Semiconductors")).toBeInTheDocument();
    expect(screen.getByText(/mkt cap 3\.4T/)).toBeInTheDocument();
    expect(screen.getByText(/1\.5× ADV/)).toBeInTheDocument();
    expect(screen.getByText(/52w 100\.00–200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/50% of range/)).toBeInTheDocument();
  });
});
