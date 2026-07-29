import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import NavActions from "@/components/NavActions";

describe("NavActions", () => {
  it("has a persistent '?' button that dispatches helpoverlay:open (G-02)", async () => {
    const onHelpOpen = vi.fn();
    window.addEventListener("helpoverlay:open", onHelpOpen);

    render(<NavActions />);
    await userEvent.click(screen.getByRole("button", { name: "Show keyboard shortcuts" }));

    expect(onHelpOpen).toHaveBeenCalledTimes(1);
    window.removeEventListener("helpoverlay:open", onHelpOpen);
  });
});
