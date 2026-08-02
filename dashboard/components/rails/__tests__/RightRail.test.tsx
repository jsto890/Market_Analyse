// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { render, screen } from "@/test/render";
import { RightRail } from "@/components/rails/RightRail";
import * as newsLib from "@/lib/news";
import * as watchlistLib from "@/lib/watchlist";
import * as calendarLib from "@/lib/calendar";

vi.mock("@/lib/news", async (importOriginal) => {
  const actual = await importOriginal<typeof newsLib>();
  return { ...actual, useNewsFeed: vi.fn() };
});

vi.mock("@/lib/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof calendarLib>();
  return { ...actual, useCalendar: vi.fn() };
});

vi.mock("@/lib/watchlist", async (importOriginal) => {
  const actual = await importOriginal<typeof watchlistLib>();
  return { ...actual, useWatchlistTickers: vi.fn() };
});

function mkItem(id: number, ts: string, ticker: string | null = null, headline = `h${id}`) {
  return { id, ts, source: "yf", ticker, headline, body: null, url: null, is_breaking: 0 };
}

beforeEach(() => {
  // No calendar unless a test supplies one: the earnings chip is opt-in.
  vi.mocked(calendarLib.useCalendar).mockReturnValue(
    { data: undefined } as ReturnType<typeof calendarLib.useCalendar>,
  );

  // The rail now defaults to collapsed at every width, so the feed tests below
  // opt in to the expanded state via the stored preference ("0" = expanded).
  // The default itself is covered by the collapse-default test at the bottom.
  const mockLocalStorage = {
    getItem: vi.fn(() => "0"),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  };
  Object.defineProperty(window, "localStorage", { value: mockLocalStorage, writable: true });

  // Mock window.innerWidth to be wider than 1280px
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: 1920,
  });

  // Mock matchMedia to return false (wide viewport, not narrow)
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("RightRail error vs empty states (RR-01)", () => {
  it("renders the error state as an alert with an amber icon", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: undefined, error: new Error("500"),
    } as any);
    render(<RightRail />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("News feed offline");
    expect(alert.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("offline")).toHaveClass("text-warn");
  });

  it("renders the empty state without the alert role and without the warn tone", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [] }, error: undefined,
    } as any);
    render(<RightRail />);
    const empty = screen.getByText(/No headlines yet/);
    expect(empty.className).not.toContain("text-warn");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("RightRail visual order (G-11)", () => {
  it("places the rail last visually via order-3 on the aside root", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [] }, error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByLabelText("Collapse news rail").closest("aside")).toHaveClass("order-3");
  });
});

describe("RightRail feed order (RR-02)", () => {
  it("orders rows by timestamp, not by reversing whatever order the API sent", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          { id: 1, ts: "2026-07-28 09:00:00", source: "yf", ticker: null, headline: "oldest", body: null, url: null, is_breaking: 0 },
          { id: 2, ts: "2026-07-28 11:00:00", source: "yf", ticker: null, headline: "newest", body: null, url: null, is_breaking: 0 },
          { id: 3, ts: "2026-07-28 10:00:00", source: "yf", ticker: null, headline: "middle", body: null, url: null, is_breaking: 0 },
        ],
      },
      error: undefined,
    } as any);
    render(<RightRail />);
    const headlines = screen.getAllByText(/oldest|newest|middle/).map((el) => el.textContent);
    expect(headlines).toEqual(["newest", "middle", "oldest"]);
  });
});

describe("RightRail new-items pill (RR-03)", () => {
  it("shows an N new pill after scrolling away when new items arrive, scroll-to-top clears it", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [mkItem(1, "2026-07-28 09:00:00"), mkItem(2, "2026-07-28 10:00:00")],
      },
      error: undefined,
    } as any);
    const { rerender } = render(<RightRail />);

    const aside = screen.getByLabelText("Collapse news rail").closest("aside") as HTMLElement;
    fireEvent.scroll(aside, { target: { scrollTop: 100 } });

    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          mkItem(1, "2026-07-28 09:00:00"),
          mkItem(2, "2026-07-28 10:00:00"),
          mkItem(3, "2026-07-28 11:00:00"),
        ],
      },
      error: undefined,
    } as any);
    rerender(<RightRail />);

    expect(screen.getByText("1 new ↑")).toBeInTheDocument();
    fireEvent.click(screen.getByText("1 new ↑"));
    expect(screen.queryByText(/new ↑/)).toBeNull();
    expect(aside.scrollTop).toBe(0);
  });
});

describe("NewsRow whale source (RR-04, R-04)", () => {
  it("spells the source out — no emoji, and no four-letter code to decode", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [{ id: 1, ts: "2026-07-28 09:00:00", source: "whale", ticker: null, headline: "big print", body: null, url: null, is_breaking: 0 }],
      },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByText(/·\s*Whale$/)).toBeInTheDocument();
    expect(screen.queryByText(/🐋/)).toBeNull();
    expect(screen.queryByText(/whl/)).toBeNull();
  });
});

describe("NewsRow clock and age (R-04)", () => {
  it("prints the ET clock, defers the age to a tooltip, and never to a title attribute", async () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    // 14:31Z on 28 Jul 2026 is 10:31 in New York.
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [{ id: 1, ts: "2026-07-28T14:31:00+00:00", source: "reuters", ticker: null, headline: "pmi beats", body: null, url: null, is_breaking: 0 }],
      },
      error: undefined,
    } as any);
    render(<RightRail />);

    const trigger = screen.getByText("10:31");
    expect(screen.getByText(/·\s*Reuters$/)).toBeInTheDocument();
    // The age is a deferral, not a printed column.
    expect(screen.queryByText(/ago$/)).toBeNull();

    const aside = trigger.closest("aside") as HTMLElement;
    expect(aside.querySelectorAll("[title]")).toHaveLength(0);

    fireEvent.focus(trigger);
    expect(await screen.findAllByText(/ago$/)).not.toHaveLength(0);
  });
});

describe("NewsRow earnings chip (R-05)", () => {
  it("marks a headline about a name reporting today, in amber, and leaves the rest alone", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: {
        today: "2026-07-28",
        days: 7,
        events: [
          { date: "2026-07-28", time_et: "16:30", event: "AAPL Q3", category: "earnings", importance: "high", source: "earnings", ticker: "AAPL" },
          { date: "2026-07-30", time_et: "16:30", event: "MSFT Q4", category: "earnings", importance: "high", source: "earnings", ticker: "MSFT" },
        ],
      },
    } as ReturnType<typeof calendarLib.useCalendar>);
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          mkItem(1, "2026-07-28 09:00:00", "AAPL", "buyback talk"),
          mkItem(2, "2026-07-28 09:01:00", "MSFT", "azure deal"),
        ],
      },
      error: undefined,
    } as any);
    render(<RightRail />);

    const chip = screen.getByText("earnings");
    expect(chip.className).toContain("text-warn");
    expect(screen.getAllByText("earnings")).toHaveLength(1);
    expect(chip.parentElement!.textContent).toContain("AAPL");
  });
});

describe("NewsRow headline is never truncated (RR-05)", () => {
  it("wraps the full headline instead of clamping it behind a hover-only title", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    const longHeadline = "A very long headline that would be clamped at three lines in the 260px rail";
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          { id: 1, ts: "2026-07-28 09:00:00", source: "yf", ticker: null, headline: longHeadline, body: null, url: null, is_breaking: 0 },
          { id: 2, ts: "2026-07-28 10:00:00", source: "yf", ticker: null, headline: "linked " + longHeadline, body: null, url: "https://example.com", is_breaking: 0 },
        ],
      },
      error: undefined,
    } as any);
    render(<RightRail />);
    for (const el of [screen.getByText(longHeadline), screen.getByText("linked " + longHeadline)]) {
      expect(el).not.toHaveAttribute("title");
      expect(el.className).not.toContain("line-clamp");
    }
  });
});

describe("NewsRow ticker link hit area (RR-06)", () => {
  it("pads the ticker link beyond the bare 10px text for a comfortable tap target", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [{ id: 1, ts: "2026-07-28 09:00:00", source: "yf", ticker: "AAPL", headline: "h", body: null, url: null, is_breaking: 0 }] },
      error: undefined,
    } as any);
    render(<RightRail />);
    const link = screen.getByRole("link", { name: "AAPL" });
    expect(link.className).toContain("py-1");
    expect(link.className).toContain("px-1.5");
  });
});

describe("RightRail names what it actually carries", () => {
  it("labels the rail News — the flow firehose lives on /options/flow, not beside every page", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:00:00")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByText("News")).toBeInTheDocument();
    expect(screen.queryByText("Chatter & Flow")).not.toBeInTheDocument();
  });

  it("carries the same name down the collapsed strip", () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue("1");
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({ data: { items: [] }, error: undefined } as any);
    render(<RightRail />);
    expect(screen.getByText("NEWS")).toBeInTheDocument();
  });
});

/** Today's date, so the hour headers render bare (no date prefix). */
function todayAt(hour: number, minute: number): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(hour)}:${p(minute)}:00`;
}

describe("RightRail hour grouping (R-06)", () => {
  it("heads each ET hour once as a span, leaving the rows in time order", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    // 28 Jul 2026 is EDT, so 14:00Z is 10:00 in New York.
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          mkItem(1, "2026-07-28T14:00:00+00:00", null, "ten-oh-oh"),
          mkItem(2, "2026-07-28T14:40:00+00:00", null, "ten-forty"),
          mkItem(3, "2026-07-28T15:10:00+00:00", null, "eleven-ten"),
        ],
      },
      error: undefined,
    } as any);
    render(<RightRail />);

    expect(screen.getAllByText("Jul 28 · 11:00 — 12:00")).toHaveLength(1);
    expect(screen.getAllByText("Jul 28 · 10:00 — 11:00")).toHaveLength(1);
    // A bucket the clock has left cannot claim to be the current one.
    expect(screen.queryByText(/— now/)).toBeNull();

    const text = screen.getByText("eleven-ten").closest("aside")!.textContent!;
    expect(text.indexOf("11:00 — 12:00")).toBeLessThan(text.indexOf("eleven-ten"));
    expect(text.indexOf("eleven-ten")).toBeLessThan(text.indexOf("10:00 — 11:00"));
    expect(text.indexOf("ten-forty")).toBeLessThan(text.indexOf("ten-oh-oh"));
  });

  it("names the hour still running rather than closing it off", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    const now = new Date();
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, now.toISOString(), null, "just landed")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    const etHour = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23",
    }).format(now);
    expect(screen.getByText(`${etHour}:00 — now`)).toBeInTheDocument();
  });

  it("dates the header once the bucket is not today's", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28T13:05:00+00:00", null, "old one")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByText("Jul 28 · 09:00 — 10:00")).toBeInTheDocument();
  });
});

describe("RightRail watchlist tagging", () => {
  it("marks the names you actually hold, and leaves the rest plain", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set(["AAPL"]));
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          mkItem(1, todayAt(9, 5), "AAPL", "mine"),
          mkItem(2, todayAt(9, 6), "TSLA", "not mine"),
        ],
      },
      error: undefined,
    } as any);
    render(<RightRail />);
    const mine = screen.getByRole("link", { name: "AAPL — on your watchlist" });
    expect(mine.className).toContain("bg-accent/15");
    const other = screen.getByRole("link", { name: "TSLA" });
    expect(other.className).not.toContain("bg-accent/15");
  });
});

describe("RightRail default state", () => {
  it("opens on Today, where the feed is a band of the page and not an interruption", () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:00:00", "AAPL", "headline")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByLabelText("Collapse news rail")).toBeInTheDocument();
    expect(screen.getByText("headline")).toBeInTheDocument();
  });

  it("is a strip on every other route, so the content column keeps the width", () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:00:00", "AAPL", "headline")] },
      error: undefined,
    } as any);
    render(<RightRail dense />);
    expect(screen.getByLabelText("Expand news rail")).toBeInTheDocument();
    expect(screen.queryByText("headline")).not.toBeInTheDocument();
  });

  it("puts the collapse control in a sticky header so it stays reachable in a long feed", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:00:00", "AAPL")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    const header = screen.getByLabelText("Collapse news rail").parentElement!;
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
  });
});
