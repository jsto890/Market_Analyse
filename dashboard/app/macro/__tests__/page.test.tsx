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

describe("MacroPage empty state (MC-03)", () => {
  it("shows empty state in place of the chart when there is no macro data", async () => {
    mockFetchJson({
      "/api/argus/macro": { gauges: [] },
      "/api/argus/history/SPY?period=1mo&interval=1d": { bars: [] },
    });
    render(<MacroPage />);
    expect(await screen.findByText("No macro data yet — the aggregator runs every 20 min.")).toBeInTheDocument();
  });

  it("shows the chart caption, not the empty state, once gauge data exists", async () => {
    mockMacroFetch();
    render(<MacroPage />);
    await screen.findByText("AI / Compute");
    expect(screen.queryByText("No macro data yet — the aggregator runs every 20 min.")).not.toBeInTheDocument();
  });
});

describe("MacroPage header + legend (MC-04)", () => {
  it("shows a page heading, subtitle, and a Macro/SPY legend", async () => {
    mockMacroFetch();
    render(<MacroPage />);
    expect(screen.getByText("Macro Sentiment")).toBeInTheDocument();
    expect(screen.getByText(/FinBERT-scored news/)).toBeInTheDocument();
    expect(await screen.findByText("Macro")).toBeInTheDocument();
    expect(screen.getByText("SPY")).toBeInTheDocument();
  });

  it("keeps score and n values monospaced after the blanket font-mono is removed", async () => {
    mockMacroFetch();
    render(<MacroPage />);
    const score = await screen.findByText("+0.10");
    expect(score.className).toMatch(/font-mono/);
  });
});

describe("MacroPage scope reconciliation (MC-02)", () => {
  it("resets scope to global when the selected scope has no data in the newly-picked window", async () => {
    mockMacroFetch();
    render(<MacroPage />);

    const sectorCard = await screen.findByText("AI / Compute");
    await userEvent.click(sectorCard);
    expect(await screen.findByText(/AI \/ Compute · 1d/)).toBeInTheDocument();

    const hourButton = screen.getByRole("button", { name: "1h" });
    await userEvent.click(hourButton);

    expect(await screen.findByText(/GLOBAL · 1h/)).toBeInTheDocument();
  });
});
