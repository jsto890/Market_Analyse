import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { render, screen } from "@/test/render";
import SectionRail, { TICKER_SECTIONS, tickerSections } from "@/components/ticker/SectionRail";

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

describe("SectionRail", () => {
  it("renders one link per section, in order, with correct href and name", () => {
    render(<SectionRail hasGamma />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      TICKER_SECTIONS.map((s) => `#${s.id}`)
    );
    // The icon is decorative; the label is the accessible name.
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual(
      TICKER_SECTIONS.map((s) => s.label)
    );
  });

  it("reaches every anchored section on the page, both columns (TN-02)", () => {
    render(<SectionRail hasGamma />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    // #sentiment had no entry at all in the bar this replaced.
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "#chart",
        "#options",
        "#gamma",
        "#why",
        "#catalysts",
        "#news",
        "#sentiment",
        "#history",
        "#ai",
      ])
    );
  });

  it("drops the gamma entry for names that have no gamma card", () => {
    render(<SectionRail />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("#gamma");
    expect(tickerSections(false).map((s) => s.id)).not.toContain("gamma");
  });

  it("marks the section as the current location, not the current page (TN-05)", () => {
    render(<SectionRail />);
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
    render(<SectionRail />);
    act(() => {
      // catalysts is reported first but sits lower on screen than why.
      ioCallback!([entry("catalysts", 640), entry("why", 120)], {} as IntersectionObserver);
    });
    expect(screen.getByRole("link", { name: "Rationale" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    expect(screen.getByRole("link", { name: "Catalysts" })).not.toHaveAttribute("aria-current");
  });

  it("names the section you are in, and no other (TN-06)", () => {
    render(<SectionRail />);
    // Tailwind isn't applied in jsdom, so read the class that does the hiding.
    const shown = () =>
      screen
        .getAllByRole("link")
        .map((l) => l.querySelector("span")!)
        .filter((s) => !s.className.includes("hidden"));

    // Before anything crosses the observer's band you are at the top, which is
    // the first section — one word, not zero and not ten.
    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toHaveTextContent("Price");
    act(() => {
      ioCallback!([entry("why", 200)], {} as IntersectionObserver);
    });
    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toHaveTextContent("Rationale");
  });

  it("ignores sections that have scrolled out of view", () => {
    render(<SectionRail />);
    act(() => {
      ioCallback!([entry("chart", -400, false), entry("news", 90)], {} as IntersectionObserver);
    });
    expect(screen.getByRole("link", { name: "News" })).toHaveAttribute("aria-current", "location");
  });
});
