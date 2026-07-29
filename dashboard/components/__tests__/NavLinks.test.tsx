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
});
