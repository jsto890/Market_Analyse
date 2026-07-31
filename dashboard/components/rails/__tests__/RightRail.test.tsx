// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { render, screen } from "@/test/render";
import { RightRail } from "@/components/rails/RightRail";
import * as newsLib from "@/lib/news";
import * as watchlistLib from "@/lib/watchlist";

vi.mock("@/lib/news", async (importOriginal) => {
  const actual = await importOriginal<typeof newsLib>();
  return { ...actual, useNewsFeed: vi.fn() };
});

vi.mock("@/lib/watchlist", async (importOriginal) => {
  const actual = await importOriginal<typeof watchlistLib>();
  return { ...actual, useWatchlistTickers: vi.fn() };
});

function mkItem(id: number, ts: string, ticker: string | null = null, headline = `h${id}`) {
  return { id, ts, source: "yf", ticker, headline, body: null, url: null, is_breaking: 0 };
}

beforeEach(() => {
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
    expect(alert).toHaveTextContent("Chatter feed offline");
    expect(alert.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("offline")).toHaveClass("text-warn");
  });

  it("renders the empty state without the alert role and without the warn tone", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [] }, error: undefined,
    } as any);
    render(<RightRail />);
    const empty = screen.getByText(/No chatter or flow yet/);
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
    expect(screen.getByLabelText("Collapse chatter rail").closest("aside")).toHaveClass("order-3");
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

describe("RightRail ticker filter (RR-03)", () => {
  it("filters to My tickers via chip, matching only watchlist symbols", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set(["AAPL"]));
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          mkItem(1, "2026-07-28 09:00:00", "AAPL", "aapl news"),
          mkItem(2, "2026-07-28 10:00:00", "TSLA", "tsla news"),
        ],
      },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByText("aapl news")).toBeInTheDocument();
    expect(screen.getByText("tsla news")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My tickers" }));
    expect(screen.getByText("aapl news")).toBeInTheDocument();
    expect(screen.queryByText("tsla news")).toBeNull();
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

    const aside = screen.getByLabelText("Collapse chatter rail").closest("aside") as HTMLElement;
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

describe("NewsRow whale source (RR-04)", () => {
  it("renders the WHL text code instead of the whale emoji", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [{ id: 1, ts: "2026-07-28 09:00:00", source: "whale", ticker: null, headline: "big print", body: null, url: null, is_breaking: 0 }],
      },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByText("whl")).toBeInTheDocument();
    expect(screen.queryByText("🐋")).toBeNull();
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
    expect(link.className).toContain("py-1.5");
    expect(link.className).toContain("px-1");
  });
});

describe("RightRail names what it actually carries", () => {
  it("labels the rail Chatter & Flow — press headlines live on the ticker page, from another feed", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:00:00")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByText("Chatter & Flow")).toBeInTheDocument();
    expect(screen.queryByText("News")).not.toBeInTheDocument();
  });

  it("carries the same name down the collapsed strip", () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue("1");
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({ data: { items: [] }, error: undefined } as any);
    render(<RightRail />);
    expect(screen.getByText("CHATTER & FLOW")).toBeInTheDocument();
  });
});

/** Today's date, so the hour headers render bare (no date prefix). */
function todayAt(hour: number, minute: number): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(hour)}:${p(minute)}:00`;
}

describe("RightRail hour grouping", () => {
  it("heads each clock hour once, leaving the rows in time order", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: {
        items: [
          mkItem(1, todayAt(9, 5), null, "nine-oh-five"),
          mkItem(2, todayAt(9, 40), null, "nine-forty"),
          mkItem(3, todayAt(10, 10), null, "ten-ten"),
        ],
      },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getAllByText("09:00")).toHaveLength(1);
    expect(screen.getAllByText("10:00")).toHaveLength(1);
    const text = screen.getByText("ten-ten").closest("aside")!.textContent!;
    expect(text.indexOf("10:00")).toBeLessThan(text.indexOf("ten-ten"));
    expect(text.indexOf("ten-ten")).toBeLessThan(text.indexOf("09:00"));
    expect(text.indexOf("nine-oh-five")).toBeGreaterThan(text.indexOf("nine-forty"));
  });

  it("dates the header once the item is not from today", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:05:00", null, "old one")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByText(/· 09:00$/)).toBeInTheDocument();
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
  it("starts collapsed with no stored preference, at any viewport width", () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:00:00", "AAPL", "headline")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    expect(screen.getByLabelText("Expand chatter rail")).toBeInTheDocument();
    expect(screen.queryByText("headline")).not.toBeInTheDocument();
  });

  it("puts the collapse control in a sticky header so it stays reachable in a long feed", () => {
    vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [mkItem(1, "2026-07-28 09:00:00", "AAPL")] },
      error: undefined,
    } as any);
    render(<RightRail />);
    const header = screen.getByLabelText("Collapse chatter rail").parentElement!;
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
  });
});
