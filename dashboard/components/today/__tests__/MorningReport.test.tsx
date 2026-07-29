import { describe, it, expect } from "vitest";
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
    mockFetchJson(() => new Promise(() => {})); // never resolves
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

  it("links watchlist-news chips with next/link, not a bare <a>", async () => {
    mockFetchJson({ "/api/argus/report/morning": baseReport });
    render(<MorningReport />);
    const chip = await screen.findByRole("link", { name: /\$NVDA news/i });
    expect(chip).toHaveAttribute("href", "/t/NVDA");
  });
});
