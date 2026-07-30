import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import ScreenerPage from "@/app/screener/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("ScreenerPage full-universe GET path (SC-01)", () => {
  it("sends min_conviction on the GET request when running the full universe", async () => {
    mockFetchJson((url: string) => {
      if (url.startsWith("/api/argus/screener")) {
        return { results: [], as_of: "2026-07-30T00:00:00Z", cached: false };
      }
      if (url === "/api/watchlist") {
        return { watchlist: [] };
      }
      return { error: "not mocked", url };
    });

    render(<ScreenerPage />);

    const user = userEvent.setup();
    const minScoreInput = screen.getByLabelText("Min score");
    await user.clear(minScoreInput);
    await user.type(minScoreInput, "0.55");

    await user.click(screen.getByRole("button", { name: "Full universe" }));

    await screen.findByText("0 signals found");

    const fetchMock = vi.mocked(fetch);
    const call = fetchMock.mock.calls.find(([input]) =>
      typeof input === "string" && input.startsWith("/api/argus/screener")
    );
    expect(call).toBeDefined();
    const url = call![0] as string;
    expect(url).toContain("min_conviction=0.55");
  });
});

describe("ScreenerPage idle state (SC-02)", () => {
  it("does not render a shimmering skeleton before any run has happened", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    await screen.findByText("Rank long candidates with the agent ensemble");
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});

describe("ScreenerPage control styling (SC-09)", () => {
  it("Run button has no solid accent fill and inputs have no focus:outline-none", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    const runBtn = await screen.findByRole("button", { name: "Run" });
    expect(runBtn.className).not.toContain("bg-accent text-white");
    const tickerInput = screen.getByPlaceholderText("Filter tickers — AAPL, TSLA, NVDA…");
    expect(tickerInput.className).not.toContain("outline-none");
  });
});

describe("ScreenerPage verdict badge (SC-04)", () => {
  it("renders verdict through Badge, not raw colored text", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0.3": {
        results: [
          { symbol: "NVDA", verdict: "LONG", score: 0.812, high_conviction: true, entry: 1, stop: 1, target: 1,
            risk_reward: 2.1, long_votes: 40, short_votes: 5, wait_votes: 2, agreement_pct: 85.1,
            ret_1d: 0.024, ret_5d: 0.081, ret_20d: null, is_extended: false, entry_quality: "good" },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      },
    });
    render(<ScreenerPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    await screen.findByText("NVDA");
    const badge = screen.getByText("LONG");
    expect(badge.className).toContain("bg-pos/15");
  });
});
