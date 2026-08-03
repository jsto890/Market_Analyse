import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import ScopeBand, { nextCatalyst } from "@/components/macro/ScopeBand";
import type { CalEvent } from "@/lib/calendar";

function ev(date: string, event: string, ticker: string | null = null): CalEvent {
  return {
    date, time_et: null, event, ticker,
    category: ticker ? "earnings" : "inflation",
    importance: "high", source: ticker ? "earnings" : "seed",
  };
}

const CONTRIBUTORS = {
  scope: "sector:AI / Compute", window: "1d", n: 3, score: 0.2, items: [],
  tickers: [{ ticker: "NVDA", n: 2 }, { ticker: "MSFT", n: 1 }],
};

function mock(over: Record<string, unknown> = {}) {
  mockFetchJson((url: string) => {
    if (url.startsWith("/api/argus/macro/contributors")) return over.contributors ?? CONTRIBUTORS;
    if (url.startsWith("/api/argus/calendar"))
      return over.calendar ?? { today: "2026-07-31", days: 21, events: [] };
    if (url === "/api/argus/portfolio") return over.portfolio ?? [];
    return {};
  });
}

describe("nextCatalyst", () => {
  const events = [
    ev("2026-08-01", "NVDA earnings", "NVDA"),
    ev("2026-08-03", "Consumer Price Index (CPI)"),
    ev("2026-08-04", "XOM earnings", "XOM"),
  ];

  it("gives GLOBAL and US the next macro release, never one name's earnings", () => {
    expect(nextCatalyst("global", events, ["NVDA"])?.event).toBe("Consumer Price Index (CPI)");
    expect(nextCatalyst("us", events, ["NVDA"])?.event).toBe("Consumer Price Index (CPI)");
  });

  it("gives a sector the earliest report from a name currently driving it", () => {
    expect(nextCatalyst("sector:AI / Compute", events, ["NVDA"])?.ticker).toBe("NVDA");
  });

  it("skips earnings for names that are not driving the scope", () => {
    // XOM reports, but nothing in this scope's headlines names it.
    expect(nextCatalyst("sector:AI / Compute", events, ["MSFT"])?.event).toBe(
      "Consumer Price Index (CPI)"
    );
  });

  it("matches a macro release to a sector through eventMeta's sector list", () => {
    const cpiOnly = [ev("2026-08-03", "Consumer Price Index (CPI)")];
    expect(nextCatalyst("sector:AI / Compute", cpiOnly, [])?.event).toBe(
      "Consumer Price Index (CPI)"
    );
    // CPI's meta names Energy, not Materials.
    expect(nextCatalyst("sector:Materials", cpiOnly, [])).toBeNull();
  });

  it("takes the earliest match whatever order the feed sends", () => {
    const shuffled = [events[2], events[1], events[0]];
    expect(nextCatalyst("sector:AI / Compute", shuffled, ["NVDA", "XOM"])?.date).toBe("2026-08-01");
  });

  it("returns null rather than a stand-in when nothing matches", () => {
    expect(nextCatalyst("sector:AI / Compute", [], ["NVDA"])).toBeNull();
  });
});

describe("ScopeBand (MAC-12)", () => {
  it("names the tickers driving the scope with their headline counts", async () => {
    mock();
    render(<ScopeBand scope="sector:AI / Compute" window="1d" />);
    expect(await screen.findByText("names driving this scope")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /NVDA/ })).toHaveAttribute("href", "/t/NVDA");
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("shows only the holdings that are in this scope, with the size held", async () => {
    mock({
      portfolio: [
        { symbol: "NVDA", position: 40 },
        { symbol: "XOM", position: 100 },
      ],
    });
    render(<ScopeBand scope="sector:AI / Compute" window="1d" />);
    expect(await screen.findByText("your exposure")).toBeInTheDocument();
    expect(screen.getByText("+40")).toBeInTheDocument();
    // XOM is held but nothing in this scope's headlines names it.
    expect(screen.queryByText("+100")).toBeNull();
  });

  it("renders no exposure cell when the gateway is offline", async () => {
    mock({ portfolio: [{ error: "IBKR not connected", ibkr_offline: true }] });
    render(<ScopeBand scope="sector:AI / Compute" window="1d" />);
    await screen.findByText("names driving this scope");
    expect(screen.queryByText("your exposure")).toBeNull();
  });

  it("drops a closed position rather than printing a zero line", async () => {
    mock({ portfolio: [{ symbol: "NVDA", position: 0 }] });
    render(<ScopeBand scope="sector:AI / Compute" window="1d" />);
    await screen.findByText("names driving this scope");
    expect(screen.queryByText("your exposure")).toBeNull();
  });

  it("dates the next catalyst against the calendar's own today", async () => {
    mock({
      calendar: {
        today: "2026-07-31",
        days: 21,
        events: [ev("2026-08-06", "NVDA earnings", "NVDA")],
      },
    });
    render(<ScopeBand scope="sector:AI / Compute" window="1d" />);
    expect(await screen.findByText("next catalyst")).toBeInTheDocument();
    expect(screen.getByText("in 6d · 6 Aug")).toBeInTheDocument();
  });

  it("renders only the cells that have a feed", async () => {
    // Contributors answer; the portfolio and the calendar do not.
    mock();
    const { container } = render(<ScopeBand scope="sector:AI / Compute" window="1d" />);
    await screen.findByText("names driving this scope");
    expect(container.querySelectorAll(".eyebrow")).toHaveLength(1);
  });

  it("stacks the cells inside a titled panel instead of a horizontal band", async () => {
    mock();
    const { container } = render(<ScopeBand scope="sector:AI / Compute" window="1d" />);
    expect(await screen.findByText("Where this lands")).toBeInTheDocument();
    // A full revert to the old `divide-x` horizontal band would still show
    // this title, so assert the stacked structure itself: each cell borders
    // its predecessor (`border-t`) except the first (`first:border-t-0`), and
    // no `divide-x` band class survives anywhere in the panel.
    const cell = (await screen.findByText("names driving this scope")).closest("div")!;
    expect(cell).toHaveClass("border-t", "first:border-t-0");
    expect(container.querySelectorAll(".divide-x")).toHaveLength(0);
  });
});
