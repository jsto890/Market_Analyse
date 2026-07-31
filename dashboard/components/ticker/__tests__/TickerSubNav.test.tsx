import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { render, screen } from "@/test/render";
import TickerSubNav, { TICKER_SECTIONS, tickerSections } from "@/components/ticker/TickerSubNav";

let ioCallback: IntersectionObserverCallback | null = null;
class FakeIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    ioCallback = cb;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

function entry(id: string, top: number, isIntersecting = true): IntersectionObserverEntry {
  return {
    isIntersecting,
    target: { id },
    boundingClientRect: { top },
  } as unknown as IntersectionObserverEntry;
}

beforeEach(() => {
  ioCallback = null;
  // @ts-expect-error - test shim, jsdom has no real IntersectionObserver
  global.IntersectionObserver = FakeIntersectionObserver;
});

describe("TickerSubNav", () => {
  it("renders one link per section, in order, with correct href and label", () => {
    render(<TickerSubNav hasGamma />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      TICKER_SECTIONS.map((s) => `#${s.id}`)
    );
    expect(links.map((l) => l.textContent)).toEqual(TICKER_SECTIONS.map((s) => s.label));
  });

  it("anchors the left column — chart, options and gamma — not just the sidebar (TN-02)", () => {
    render(<TickerSubNav hasGamma />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["#chart", "#options", "#gamma"]));
  });

  it("drops the gamma tab for names that have no gamma card", () => {
    render(<TickerSubNav />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("#gamma");
    expect(tickerSections(false).map((s) => s.id)).not.toContain("gamma");
  });

  it("does not simply echo the panel headings below it (TN-01)", () => {
    const labels = TICKER_SECTIONS.map((s) => s.label);
    // These panel titles used to be repeated verbatim 40px lower.
    expect(labels).not.toContain("Levels");
    expect(labels).not.toContain("Why");
    expect(labels).not.toContain("News");
    expect(labels).not.toContain("Sentiment");
  });

  it("marks the section as the current location, not the current page (TN-05)", () => {
    render(<TickerSubNav />);
    act(() => {
      ioCallback!([entry("why", 200)], {} as IntersectionObserver);
    });
    expect(screen.getByRole("link", { name: "Rationale" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    expect(screen.getByRole("link", { name: "Price" })).not.toHaveAttribute("aria-current");
  });

  it("activates the topmost intersecting section, whatever order the callback reports (TN-04)", () => {
    render(<TickerSubNav />);
    act(() => {
      // catalysts is reported first but sits lower on screen than levels.
      ioCallback!([entry("catalysts", 640), entry("levels", 120)], {} as IntersectionObserver);
    });
    expect(screen.getByRole("link", { name: "Trade plan" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    expect(screen.getByRole("link", { name: "Catalysts" })).not.toHaveAttribute("aria-current");
  });

  it("ignores sections that have scrolled out of view", () => {
    render(<TickerSubNav />);
    act(() => {
      ioCallback!([entry("chart", -400, false), entry("news", 90)], {} as IntersectionObserver);
    });
    expect(screen.getByRole("link", { name: "News & tone" })).toHaveAttribute(
      "aria-current",
      "location"
    );
  });
});
