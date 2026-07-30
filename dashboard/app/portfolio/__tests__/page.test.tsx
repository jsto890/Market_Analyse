import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
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
