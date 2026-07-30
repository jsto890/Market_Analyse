import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import MacroPage from "../page";

const searchParamsMock = vi.hoisted(() => ({ current: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsMock.current),
}));

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

describe("MacroPage gauge card semantics (MC-05)", () => {
  it("marks the selected scope card aria-pressed and leaves the rest unpressed", async () => {
    mockMacroFetch();
    render(<MacroPage />);
    const globalCard = await screen.findByRole("button", { name: /GLOBAL/ });
    expect(globalCard).toHaveAttribute("aria-pressed", "true");
    const sectorCard = screen.getByRole("button", { name: /AI \/ Compute/ });
    expect(sectorCard).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the n= count at the data-floor size with no opacity utility", async () => {
    mockMacroFetch();
    render(<MacroPage />);
    const nEl = await screen.findByText("n=50");
    expect(nEl.className).toMatch(/text-\[11px\]/);
    expect(nEl.className).not.toMatch(/opacity-/);
  });
});

describe("MacroPage window from URL (MC-06)", () => {
  it("initializes the window from a ?window= query param", async () => {
    searchParamsMock.current = "window=1w";
    mockFetchJson((url: string) => {
      if (url === "/api/argus/macro") return { gauges: [{ scope: "global", window: "1w", score: 0.1, n: 10, ts: "2026-07-28T00:00:00Z" }] };
      if (url.startsWith("/api/argus/macro/series")) return { scope: "global", window: "1w", points: [] };
      if (url.startsWith("/api/argus/history/SPY")) return { bars: [] };
      return {};
    });
    render(<MacroPage />);
    const activeWindow = await screen.findByRole("button", { name: "1w" });
    expect(activeWindow.className).toMatch(/bg-accent\/20/);
  });

  it("defaults to 1d when no query param is present", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    const activeWindow = await screen.findByRole("button", { name: "1d" });
    expect(activeWindow.className).toMatch(/bg-accent\/20/);
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
