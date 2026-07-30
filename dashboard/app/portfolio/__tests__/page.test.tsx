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
