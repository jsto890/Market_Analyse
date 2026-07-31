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

  it("renders inside a foldable Collapsible once loaded", async () => {
    mockFetchJson({ "/api/argus/report/morning": baseReport });
    render(<MorningReport />);
    expect(await screen.findByRole("button", { name: /Morning Brief/i })).toBeInTheDocument();
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

  it("scopes the macro block to today and tomorrow, pushing the rest to the calendar (MB-03)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        macro_events: [
          { date: "2026-07-28", time_et: "08:30", event: "CPI (Consumer Price Index)", category: "inflation", importance: "high", ticker: null },
          { date: "2026-08-06", time_et: "08:30", event: "Initial jobless claims", category: "jobs", importance: "medium", ticker: null },
          { date: "2026-08-07", time_et: "08:30", event: "Employment Situation (Nonfarm Payrolls)", category: "jobs", importance: "high", ticker: null },
        ],
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText(/today 08:30 ET · CPI/)).toBeInTheDocument();
    expect(screen.queryByText(/Jobless claims/)).not.toBeInTheDocument();
    const more = screen.getByText("+2 later this week · calendar ›");
    expect(more.closest("a")).toHaveAttribute("href", "/calendar");
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
    expect(gex.className).not.toContain("text-[11px]");
  });

  it("labels the three prose lines with roles (MB-05)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        day_ahead: { ...baseReport.day_ahead, synthesis: "ES +0.4%", gex_line: "SPY pinned" },
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Positioning")).toBeInTheDocument();
    expect(screen.getByText("Tone")).toBeInTheDocument();
  });

  it("says the neutral tone once, with a link out, instead of twice (MB-06)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": { ...baseReport, macro: { us_1d: 0.04, global_1d: 0.04 } },
    });
    render(<MorningReport />);
    expect(await screen.findByText(/inside the ±0.05 neutral band/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /why/ })).toHaveAttribute("href", "/macro");
  });

  it("says the session is unconfirmed rather than rendering an anonymous row (MB-07)", async () => {
    mockFetchJson({
      "/api/argus/report/morning": {
        ...baseReport,
        day_ahead: {
          ...baseReport.day_ahead,
          earnings_today: [{
            date: "2026-07-28", time_et: null, event: "AAPL earnings", category: "earnings",
            importance: "high", ticker: "AAPL", session: "—", watchlist: true,
          }],
        },
      },
    });
    render(<MorningReport />);
    expect(await screen.findByText("time TBA")).toBeInTheDocument();
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

  it("stamps when the brief was built, not just its date (MB-09)", async () => {
    // The API stamps naive local time, matching the box the report is built on.
    const d = new Date(Date.now() - 6 * 60_000);
    const p = (n: number) => String(n).padStart(2, "0");
    const built = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    mockFetchJson({ "/api/argus/report/morning": { ...baseReport, generated_at: built } });
    render(<MorningReport />);
    expect(
      await screen.findByText((_, el) => el?.textContent === "built 6m ago", { selector: "span" })
    ).toBeInTheDocument();
  });

  it("offers a way out of the truncated card (MB-10)", async () => {
    mockFetchJson({ "/api/argus/report/morning": baseReport });
    render(<MorningReport />);
    const full = await screen.findByRole("link", { name: /Full brief/ });
    expect(full).toHaveAttribute("href", "/brief");
  });
});
