import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import NavLinks from "@/components/NavLinks";

vi.mock("next/navigation", () => ({
  usePathname: () => "/rotation",
}));

describe("NavLinks", () => {
  it("includes a Macro link pointing at /macro (G-01)", () => {
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Macro" })).toHaveAttribute("href", "/macro");
  });

  it("marks the active route with aria-current=page and leaves inactive routes unset (G-12)", () => {
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Rotation" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
  });

  it("splits the nine links into daily loop / context / your book, in that order", () => {
    const { container } = render(<NavLinks />);
    const order = Array.from(container.querySelectorAll("a")).map((a) => a.textContent);
    expect(order).toEqual([
      "Today", "Watchlist", "Screener",
      "Options", "Rotation", "Macro", "Calendar",
      "Portfolio", "Alerts",
    ]);
    // Two rules for three groups — separators between, never on the outside.
    expect(container.querySelectorAll("span[aria-hidden].w-px")).toHaveLength(2);
  });
});
