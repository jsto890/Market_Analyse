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

const TILES: Record<string, unknown> = {
  "1d": {
    window: "1d",
    tiles: [
      { scope: "global", score: 0.1, n: 50, ts: "2026-07-28T00:00:00Z", delta_1h: 0.02, delta_1d: -0.04, spark: [0.05, 0.08, 0.1] },
      { scope: "sector:AI / Compute", score: 0.3, n: 10, ts: "2026-07-28T00:00:00Z", delta_1h: null, delta_1d: 0.12, spark: [0.2, 0.3] },
    ],
  },
  "1h": {
    window: "1h",
    tiles: [
      { scope: "global", score: 0.04, n: 20, ts: "2026-07-28T00:00:00Z", delta_1h: 0.0, delta_1d: null, spark: [0.03, 0.04] },
    ],
  },
  "1w": {
    window: "1w",
    tiles: [
      { scope: "global", score: 0.1, n: 90, ts: "2026-07-28T00:00:00Z", delta_1h: null, delta_1d: 0.01, spark: [0.09, 0.1] },
    ],
  },
};

function mockMacroFetch() {
  mockFetchJson((url: string) => {
    if (url === "/api/argus/macro") return { gauges: GAUGES };
    if (url.startsWith("/api/argus/macro/tiles")) {
      const win = new URL(url, "http://x").searchParams.get("window") ?? "1d";
      return TILES[win];
    }
    if (url.startsWith("/api/argus/macro/contributors"))
      return { scope: "global", window: "1d", n: 0, score: 0, items: [], tickers: [] };
    if (url.startsWith("/api/argus/macro/series")) return { scope: "global", window: "1d", points: [] };
    if (url.startsWith("/api/argus/history/SPY")) return { bars: [] };
    return {};
  });
}

describe("MacroPage empty state (MC-03)", () => {
  it("shows empty state in place of the chart when there is no macro data", async () => {
    searchParamsMock.current = "";
    mockFetchJson((url: string) => {
      if (url === "/api/argus/macro") return { gauges: [] };
      if (url.startsWith("/api/argus/macro/tiles")) return { window: "1d", tiles: [] };
      if (url.startsWith("/api/argus/history/SPY")) return { bars: [] };
      return {};
    });
    render(<MacroPage />);
    expect(await screen.findByText("No macro data yet — the aggregator runs every 20 min.")).toBeInTheDocument();
  });

  it("shows the chart caption, not the empty state, once gauge data exists", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    await screen.findByText("AI / Compute");
    expect(screen.queryByText("No macro data yet — the aggregator runs every 20 min.")).not.toBeInTheDocument();
  });
});

describe("MacroPage header + legend (MC-04, MAC-06)", () => {
  it("shows a page heading, subtitle, and a Macro/SPY legend", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    expect(screen.getByText("Macro Sentiment")).toBeInTheDocument();
    expect(screen.getByText(/FinBERT-scored news/)).toBeInTheDocument();
    expect(await screen.findByText("Macro score (left)")).toBeInTheDocument();
    expect(screen.getByText(/SPY close \(right/)).toBeInTheDocument();
  });

  it("states the neutral band in the legend instead of applying it invisibly (MAC-06)", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    expect(await screen.findByText(/±0.05 neutral band/)).toBeInTheDocument();
  });

  it("reads the chart with a read-this strip naming the ±0.05 threshold", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    expect(await screen.findByText("Read this")).toBeInTheDocument();
    expect(screen.getByText(/±0\.05 lines mark the neutral zone/)).toBeInTheDocument();
    expect(screen.getByText(/not a signal/)).toBeInTheDocument();
  });

  it("discloses the model, corpus, decay and what a number means (MAC-05)", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    expect(screen.getByText(/How this score is computed/)).toBeInTheDocument();
    expect(screen.getByText(/FinBERT \(ProsusAI\/finbert\)/)).toBeInTheDocument();
    expect(screen.getByText(/half-life of 12 hours/)).toBeInTheDocument();
    expect(screen.getByText(/before decay weighting/)).toBeInTheDocument();
  });

  it("opens by default but folds away on demand, rather than a fixed disclosure (O-07)", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    const trigger = screen.getByRole("button", { name: /How this score is computed/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("MacroPage tiles (MAC-07)", () => {
  it("marks the selected scope card aria-pressed and leaves the rest unpressed", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    const globalCard = await screen.findByRole("button", { name: /GLOBAL/ });
    expect(globalCard).toHaveAttribute("aria-pressed", "true");
    const sectorCard = screen.getByRole("button", { name: /AI \/ Compute/ });
    expect(sectorCard).toHaveAttribute("aria-pressed", "false");
  });

  it("shows change over 1h and 1d, not just a static level", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    expect(await screen.findByText(/1h ↑\+0\.02/)).toBeInTheDocument();
    expect(screen.getByText(/1d ↓-0\.04/)).toBeInTheDocument();
  });

  it("renders the n= count at the data-floor size with no opacity utility", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    const nEl = await screen.findByText("n=50");
    expect(nEl.className).toMatch(/text-data/);
    expect(nEl.className).not.toMatch(/opacity-/);
  });
});

describe("MacroPage lookback control (MC-06, MAC-08, MAC-10)", () => {
  it("initializes the window from a ?window= query param", async () => {
    searchParamsMock.current = "window=1w";
    mockMacroFetch();
    render(<MacroPage />);
    const activeWindow = await screen.findByRole("radio", { name: "1 week" });
    expect(activeWindow).toHaveAttribute("aria-checked", "true");
  });

  it("defaults to 1d and labels the control rather than showing bare codes (MAC-10)", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);
    const activeWindow = await screen.findByRole("radio", { name: "1 day" });
    expect(activeWindow).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Lookback")).toBeInTheDocument();
    expect(screen.getByText(/previous 24 hours/)).toBeInTheDocument();
  });

  it("moves the SPY benchmark timebase with the lookback (MAC-08)", async () => {
    searchParamsMock.current = "";
    const calls: string[] = [];
    mockFetchJson((url: string) => {
      calls.push(url);
      if (url === "/api/argus/macro") return { gauges: GAUGES };
      if (url.startsWith("/api/argus/macro/tiles")) {
        const win = new URL(url, "http://x").searchParams.get("window") ?? "1d";
        return TILES[win];
      }
      if (url.startsWith("/api/argus/macro/contributors"))
        return { scope: "global", window: "1d", n: 0, score: 0, items: [], tickers: [] };
      if (url.startsWith("/api/argus/macro/series")) return { scope: "global", window: "1d", points: [] };
      if (url.startsWith("/api/argus/history/SPY")) return { bars: [] };
      return {};
    });
    render(<MacroPage />);
    await screen.findByText("Macro score (left)");
    expect(calls.some((u) => u === "/api/argus/history/SPY?period=5d&interval=30m")).toBe(true);
    expect(calls.some((u) => u.includes("period=1mo&interval=1d"))).toBe(false);

    await userEvent.click(screen.getByRole("radio", { name: "1 hour" }));
    await vi.waitFor(() =>
      expect(calls.some((u) => u === "/api/argus/history/SPY?period=5d&interval=15m")).toBe(true)
    );
  });
});

describe("MacroPage scope reconciliation (MC-02, MAC-11)", () => {
  it("explains the reset instead of silently snapping back to global", async () => {
    searchParamsMock.current = "";
    mockMacroFetch();
    render(<MacroPage />);

    const sectorCard = await screen.findByText("AI / Compute");
    await userEvent.click(sectorCard);
    expect(await screen.findByText(/AI \/ Compute · 1 day lookback/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "1 hour" }));

    expect(await screen.findByText(/GLOBAL · 1 hour lookback/)).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toMatch(
      /AI \/ Compute has no scored headlines in the 1 hour lookback/
    );
  });
});
