import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import PortfolioPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("PortfolioPage subtitle (PF-02)", () => {
  it("states the real connection: TWS, port 7496, live", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    expect(await screen.findByText(/TWS · port 7496 · live/)).toBeInTheDocument();
    expect(screen.queryByText(/IBKR Gateway 4002/)).not.toBeInTheDocument();
  });
});

describe("PortfolioPage offline state has no fake-loading skeleton (PF-03)", () => {
  it("does not render an animated skeleton when IBKR is offline", async () => {
    mockFetchJson({
      "/api/argus/portfolio": { error: "IBKR not connected", ibkr_offline: true },
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByText(/TWS · port 7496 · live/);
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});

describe("PortfolioPage DataTable migration (PF-04, PF-05)", () => {
  it("renders positions via DataTable and navigates on row click, with no bare › button", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD", high_conviction: false },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByText("AAPL");
    expect(screen.queryByText("›")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText("AAPL").closest("tr")!);
    expect(screen.getByRole("columnheader", { name: "Symbol" })).toBeInTheDocument();
  });
});

describe("PortfolioPage account summary + P&L columns (PF-01)", () => {
  it("shows an account summary strip and market value / unrealized P&L columns", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD",
          market_value: 1905.0, unrealized_pnl: 105.0 },
      ],
      "/api/watchlist": { watchlist: [] },
      "/api/argus/account": { NetLiquidation: "48210.55", TotalCashValue: "12000.00", BuyingPower: "96000.00" },
    });
    render(<PortfolioPage />);
    await screen.findByText("AAPL");
    expect(screen.getByText("NLV")).toBeInTheDocument();
    expect(screen.getByText("+$48,210.55")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mkt Value" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Unrl. P&L" })).toBeInTheDocument();
    expect(screen.getByText("+$105.00")).toBeInTheDocument();
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

describe("PortfolioPage edge badge + tooltip (PF-08)", () => {
  it("renders edge through Badge with an explanatory tooltip", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD" },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByText("AAPL");
    const edgeBadge = screen.getByText("HOLD/ADD", { selector: "span.font-mono" });
    expect(edgeBadge.className).toContain("bg-model");
    expect(screen.getByRole("button", { name: /edge explanation/i })).toBeInTheDocument();
  });
});
