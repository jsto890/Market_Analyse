import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { render, screen } from "@/test/render";
import TickerSubNav, { TICKER_SECTIONS } from "@/components/ticker/TickerSubNav";

let ioCallback: IntersectionObserverCallback | null = null;
class FakeIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    ioCallback = cb;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  ioCallback = null;
  // @ts-expect-error - test shim, jsdom has no real IntersectionObserver
  global.IntersectionObserver = FakeIntersectionObserver;
});

describe("TickerSubNav", () => {
  it("renders one link per section, in order, with correct href and label", () => {
    render(<TickerSubNav />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      TICKER_SECTIONS.map((s) => `#${s.id}`)
    );
    expect(links.map((l) => l.textContent)).toEqual(
      TICKER_SECTIONS.map((s) => s.label)
    );
  });

  it("sets aria-current=true only on the currently-intersecting section's link", () => {
    render(<TickerSubNav />);
    expect(ioCallback).not.toBeNull();

    act(() => {
      ioCallback!(
        [
          {
            isIntersecting: true,
            target: { id: "why" },
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );
    });

    expect(screen.getByRole("link", { name: "Why" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(
      screen.getByRole("link", { name: "Levels" })
    ).not.toHaveAttribute("aria-current");
  });
});
