import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import MacroPage from "../page";

const GAUGES = [
  { scope: "global", window: "1d", score: 0.1, n: 50, ts: "2026-07-28T00:00:00Z" },
  { scope: "sector:AI / Compute", window: "1d", score: 0.3, n: 10, ts: "2026-07-28T00:00:00Z" },
  { scope: "global", window: "1h", score: 0.05, n: 20, ts: "2026-07-28T00:00:00Z" },
];

function mockMacroFetch() {
  mockFetchJson((url: string) => {
    if (url === "/api/argus/macro") return { gauges: GAUGES };
    if (url.startsWith("/api/argus/macro/series")) return { scope: "global", window: "1d", points: [] };
    if (url.startsWith("/api/argus/history/SPY")) return { bars: [] };
    return {};
  });
}

describe("MacroPage scope reconciliation (MC-02)", () => {
  it("resets scope to global when the selected scope has no data in the newly-picked window", async () => {
    mockMacroFetch();
    render(<MacroPage />);

    const sectorCard = await screen.findByText("AI / Compute");
    await userEvent.click(sectorCard);
    expect(await screen.findByText(/AI \/ Compute · 1d vs SPY/)).toBeInTheDocument();

    const hourButton = screen.getByRole("button", { name: "1h" });
    await userEvent.click(hourButton);

    expect(await screen.findByText(/GLOBAL · 1h vs SPY/)).toBeInTheDocument();
  });
});
