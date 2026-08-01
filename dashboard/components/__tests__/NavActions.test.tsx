import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import NavActions from "@/components/NavActions";

describe("NavActions", () => {
  it("opens the command palette from the ⌘K affordance (G-02)", async () => {
    const onOpen = vi.fn();
    window.addEventListener("commandk:open", onOpen);

    render(<NavActions />);
    await userEvent.click(screen.getByRole("button", { name: "Open command palette" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    window.removeEventListener("commandk:open", onOpen);
  });

  it("carries Learn and nothing else beside the status cluster — one clock per page (G1)", () => {
    render(<NavActions />);
    expect(screen.getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
    // The '?' button is gone; the key still opens the overlay globally.
    expect(screen.queryByRole("button", { name: "Show keyboard shortcuts" })).toBeNull();
  });
});
