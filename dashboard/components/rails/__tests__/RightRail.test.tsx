// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { RightRail } from "@/components/rails/RightRail";
import * as newsLib from "@/lib/news";

vi.mock("@/lib/news", async (importOriginal) => {
  const actual = await importOriginal<typeof newsLib>();
  return { ...actual, useNewsFeed: vi.fn() };
});

beforeEach(() => {
  // Mock localStorage to return null (no stored preference)
  const mockLocalStorage = {
    getItem: vi.fn(() => null),
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
  it("renders the error state with an amber icon, distinct from the muted empty state", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: undefined, error: new Error("500"),
    } as ReturnType<typeof newsLib.useNewsFeed>);
    render(<RightRail />);
    const offline = screen.getByText("news feed offline");
    expect(offline.className).toContain("text-warn");
    expect(offline.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("offline")).toHaveClass("text-warn");
  });

  it("renders the empty state without an icon and without the warn tone", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [] }, error: undefined,
    } as ReturnType<typeof newsLib.useNewsFeed>);
    render(<RightRail />);
    const empty = screen.getByText(/no news yet/);
    expect(empty.className).not.toContain("text-warn");
    expect(empty.querySelector("svg")).toBeNull();
  });
});

describe("RightRail visual order (G-11)", () => {
  it("places the rail last visually via order-3 on the aside root", () => {
    vi.mocked(newsLib.useNewsFeed).mockReturnValue({
      data: { items: [] }, error: undefined,
    } as ReturnType<typeof newsLib.useNewsFeed>);
    render(<RightRail />);
    expect(screen.getByLabelText("Collapse news rail").closest("aside")).toHaveClass("order-3");
  });
});
