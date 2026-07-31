import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import PortfolioPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("PortfolioPage connection chip (PF-02)", () => {
  it("states the real connection beside the title, not in the subtitle", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    expect(await screen.findByText(/TWS · port 7496 · live/)).toBeInTheDocument();
    expect(screen.queryByText(/IBKR Gateway 4002/)).not.toBeInTheDocument();
  });

  it("says offline when the connection is down, rather than claiming live", async () => {
    mockFetchJson({
      "/api/argus/portfolio": { error: "IBKR not connected", ibkr_offline: true },
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    expect(await screen.findByText(/TWS · port 7496 · offline/)).toBeInTheDocument();
  });
});

describe("PortfolioPage offline state has no fake-loading skeleton (PF-03)", () => {
  it("does not render an animated skeleton when IBKR is offline", async () => {
    mockFetchJson({
      "/api/argus/portfolio": { error: "IBKR not connected", ibkr_offline: true },
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByText(/TWS · port 7496 · offline/);
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});

describe("PortfolioPage position cards (PF-04, PF-05)", () => {
  it("renders each position as a card that links to its ticker page", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD", high_conviction: false },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    expect(await screen.findByRole("link", { name: "AAPL" })).toHaveAttribute("href", "/t/AAPL");
    expect(screen.queryByRole("columnheader", { name: "Symbol" })).not.toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});

describe("PortfolioPage band (PF-01)", () => {
  it("states where the account stands: NLV, unrealised, cash, exposure, concentration", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD",
          market_value: 1905.0, unrealized_pnl: 105.0 },
        { symbol: "AMD", position: 5, avg_cost: 100, verdict: "WAIT", score: 0.1, edge: "NEUTRAL",
          market_value: 635.0, unrealized_pnl: -35.0 },
      ],
      "/api/watchlist": { watchlist: [] },
      "/api/argus/account": { NetLiquidation: "5080.00", TotalCashValue: "2540.00", BuyingPower: "96000.00" },
    });
    render(<PortfolioPage />);
    await screen.findByRole("link", { name: "AAPL" });
    expect(screen.getByText("NLV")).toBeInTheDocument();
    expect(screen.getByText("+$5,080.00")).toBeInTheDocument();
    // 1905 + 635 = 2540 gross against 5080 NLV; AAPL is 75% of the book.
    expect(screen.getByText("Exposure")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("+$70.00")).toBeInTheDocument();
  });

  it("carries no day P&L chip — the IBKR account summary has no such feed", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [],
      "/api/watchlist": { watchlist: [] },
      "/api/argus/account": { NetLiquidation: "5080.00", TotalCashValue: "2540.00" },
    });
    render(<PortfolioPage />);
    await screen.findByText("NLV");
    expect(screen.queryByText(/day p&l/i)).not.toBeInTheDocument();
  });
});

describe("PortfolioPage disagreement band (PF-09)", () => {
  it("leads with the positions Argus has turned against, and says why", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD" },
        { symbol: "TSLA", position: 20, avg_cost: 300, verdict: "SHORT", score: -0.7,
          edge: "CONSIDER SELLING", unrealized_pnl: -1200 },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    const band = (await screen.findByText(/Argus has turned against 1 position/)).closest("section")!;
    expect(band).toHaveTextContent("TSLA");
    expect(band).not.toHaveTextContent("AAPL");
    expect(band).toHaveTextContent(/the original thesis is being contradicted/);
  });

  it("renders nothing at all when every position still agrees", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD" },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByRole("link", { name: "AAPL" });
    expect(screen.queryByText(/turned against/)).not.toBeInTheDocument();
  });
});

describe("PortfolioPage offline messaging (PF-06, PF-07)", () => {
  it("states why the pinned-watchlist fallback is shown when IBKR is fully offline", async () => {
    mockFetchJson({
      "/api/argus/portfolio": { error: "IBKR not connected", ibkr_offline: true },
      "/api/watchlist": { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01" }] },
    });
    render(<PortfolioPage />);
    expect(
      await screen.findByText(/TWS is offline — showing your pinned watchlist instead of live positions/)
    ).toBeInTheDocument();
  });

  it("states the source when rows are individually yfinance-backed (liveOffline)", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "NVDA", position: null, avg_cost: null, edge: "HOLD/ADD", ibkr_offline: true },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    expect(
      await screen.findByText(/Price-only preview from your pinned watchlist — TWS positions unavailable/)
    ).toBeInTheDocument();
  });
});

describe("PortfolioPage edge spelled out (PF-08)", () => {
  it("prints the edge meaning on the card instead of hiding it in a tooltip", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD" },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByRole("link", { name: "AAPL" });
    const edgeBadge = screen.getByText("HOLD/ADD", { selector: "span.font-mono" });
    expect(edgeBadge.className).toContain("bg-model");
    expect(screen.getByText(/hold, or add on strength/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edge explanation/i })).not.toBeInTheDocument();
  });
});
