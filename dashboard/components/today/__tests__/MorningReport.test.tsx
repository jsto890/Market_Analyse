import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { MorningReport } from "@/components/today/MorningReport";

const baseReport = {
  date: "2026-07-28",
  weekday: "Tuesday",
  tone: "Cautiously constructive.",
  futures: [],
  today_events: [],
  macro_events: [],
  earnings: [],
  headlines: [],
  day_ahead: {
    synthesis: "Quiet slate.",
    earnings_today: [],
    earnings_tomorrow: [],
    gex_line: null,
    watchlist_news: [{ ticker: "NVDA", headline: "NVDA: guidance raise" }],
  },
};

describe("MorningReport — loading/error/collapse (TD-09)", () => {
  it("shows a skeleton while the report is loading, not nothing", () => {
    // mockFetchJson JSON.stringifies whatever the resolver returns, so a
    // pending Promise value serializes to "{}" instead of actually hanging —
    // stub fetch directly so the request genuinely never resolves.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<MorningReport />);
    expect(screen.getByLabelText(/loading morning brief/i)).toBeInTheDocument();
  });

  it("shows an error state instead of silently vanishing when the fetch fails", async () => {
    mockFetchJson(() => {
      throw new Error("500");
    });
    render(<MorningReport />);
    expect(await screen.findByText(/couldn.t load the morning brief/i)).toBeInTheDocument();
  });

  it("renders as a masthead once loaded — a heading, not a fold to open", async () => {
    mockFetchJson({ "/api/argus/report/morning": baseReport });
    render(<MorningReport />);
    expect(await screen.findByRole("heading", { name: "Morning brief" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Morning Brief/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Tuesday 2026-07-28/)).toBeInTheDocument();
  });

  it("links watchlist-news rows with next/link, not a bare <a>", async () => {
    mockFetchJson({ "/api/argus/report/morning": baseReport });
    render(<MorningReport />);
    const chip = await screen.findByRole("link", { name: /\$NVDA/ });
    expect(chip).toHaveAttribute("href", "/t/NVDA");
  });
});

describe("MorningReport — content (MB-01..MB-09)", () => {
  it("shows the headline itself, not '$TICKER news' with the text hidden in a title (MB-02)", async () => {
    mockFetchJson({ "/api/argus/report/morning": baseReport });
    render(<MorningReport />);
    expect(await screen.findByText("NVDA: guidance raise")).toBeInTheDocument();
    expect(screen.queryByText(/\$NVDA news/)).not.toBeInTheDocument();
  });

  it("collapses repeated tickers to one row with an overflow count (MB-01)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        day_ahead: {
          ...baseReport.day_ahead,
          watchlist_news: [
            { ticker: "MSFT", headline: "MSFT: cloud beat" },
            { ticker: "MSFT", headline: "MSFT: buyback" },
            { ticker: "MSFT", headline: "MSFT: analyst note" },
            { ticker: "AAPL", headline: "AAPL: supplier cut" },
          ],
        },
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("MSFT: cloud beat")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getByText("AAPL: supplier cut")).toBeInTheDocument();
  });

  it("leaves the day's schedule to the tape and carries none of it itself (MB-03)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        macro_events: [
          { date: "2026-07-28", time_et: "08:30", event: "CPI (Consumer Price Index)", category: "inflation", importance: "high", ticker: null },
          { date: "2026-08-07", time_et: "08:30", event: "Employment Situation (Nonfarm Payrolls)", category: "jobs", importance: "high", ticker: null },
        ],
      },
    });
    render(<MorningReport />);
    await screen.findByRole("heading", { name: "Morning brief" });
    expect(screen.queryByText(/CPI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nonfarm Payrolls/)).not.toBeInTheDocument();
  });

  it("gives the positioning line stronger type than the tone line (MB-04)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        day_ahead: { ...baseReport.day_ahead, gex_line: "SPY zero-gamma 632, spot above" },
      },
    });
    render(<MorningReport />);
    const gex = await screen.findByText("SPY zero-gamma 632, spot above");
    expect(gex.className).toContain("text-foreground");
    expect(gex.className).not.toContain("text-muted");
    expect(gex.className).not.toContain("text-micro");
  });

  it("labels the three reads as tiles (MB-05)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        day_ahead: { ...baseReport.day_ahead, synthesis: "ES +0.4%", gex_line: "SPY pinned" },
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("Tape")).toBeInTheDocument();
    expect(screen.getByText("Positioning")).toBeInTheDocument();
    expect(screen.getByText("Tone")).toBeInTheDocument();
  });

  it("says the neutral tone once, with a way through to the gauge (MB-06)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": { ...baseReport, macro: { us_1d: 0.04, global_1d: 0.04 } },
    });
    render(<MorningReport />);
    expect(await screen.findByText(/inside the ±0.05 neutral band/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /macro/ })).toHaveAttribute("href", "/macro");
  });

  it("splits the parsed GEX line into a verdict, its figures and the read (MB-07)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        day_ahead: {
          ...baseReport.day_ahead,
          gex_line: "GEX supportive (+2.1B, spot +0.8% vs zero-gamma) — dips likely bought",
        },
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("supportive")).toBeInTheDocument();
    expect(screen.getByText("+2.1B, spot +0.8% vs zero-gamma")).toBeInTheDocument();
    expect(screen.getByText("dips likely bought")).toBeInTheDocument();
    // The tile is the way through to the page that owns the number.
    expect(screen.getByRole("link", { name: /gamma/ })).toHaveAttribute("href", "/options/gamma");
  });

  it("renders futures as chips with the raw symbol suffixes stripped (MB-08)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        futures: [{ symbol: "ES=F", change_pct: 0.42 }, { symbol: "^VIX", change_pct: -1.5 }],
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("ES")).toBeInTheDocument();
    expect(screen.getByText("VIX")).toBeInTheDocument();
    expect(screen.queryByText("^VIX")).not.toBeInTheDocument();
  });

  it("gives the tape tile the same verdict → figures → read shape as its neighbours", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        futures: [
          { symbol: "ES=F", change_pct: 0.42 },
          { symbol: "^VIX", change_pct: -1.5 },
        ],
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("risk-on")).toBeInTheDocument();
    expect(screen.getByText(/Futures bid and vol offered/)).toBeInTheDocument();
  });

  it("won't call a direction on futures inside the flat band", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        futures: [
          { symbol: "ES=F", change_pct: 0.04 },
          { symbol: "^VIX", change_pct: -1.5 },
        ],
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("flat")).toBeInTheDocument();
  });

  it("drops the arrow when the tone delta rounds to zero", async () => {
    mockFetchJson({
      "/api/argus/macro/tiles?window=1d&points=20": {
        window: "1d",
        tiles: [{ scope: "us", score: 0.42, delta_1d: 0.001 }],
      },
      "/api/argus/report/morning": baseReport,
    });
    render(<MorningReport />);
    // +0.00 ▲ asserts a direction the printed figure doesn't have.
    expect(await screen.findByText(/\+0\.00 1d/)).toBeInTheDocument();
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
  });

  it("stamps when the brief was built, not just its date (MB-09)", async () => {
    // The API stamps naive local time, matching the box the report is built on.
    const d = new Date(Date.now() - 6 * 60_000);
    const p = (n: number) => String(n).padStart(2, "0");
    const built = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    mockFetchJson({ "/api/argus/report/morning": { ...baseReport, generated_at: built } });
    render(<MorningReport />);
    // Freshness now renders through the shared `Stale` line: "as of HH:MM · 6m ago".
    expect(await screen.findByText(/6m ago/)).toBeInTheDocument();
  });

  it("offers a way out of the truncated card (MB-10)", async () => {
    mockFetchJson({ "/api/argus/report/morning": baseReport });
    render(<MorningReport />);
    const full = await screen.findByRole("link", { name: /Full brief/ });
    expect(full).toHaveAttribute("href", "/brief");
  });
});
