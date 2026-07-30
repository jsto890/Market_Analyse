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
