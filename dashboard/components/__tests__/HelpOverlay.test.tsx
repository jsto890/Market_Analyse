import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import HelpOverlay from "@/components/HelpOverlay";

describe("HelpOverlay", () => {
  it("opens in response to helpoverlay:open, not only the ? keydown (G-02)", async () => {
    render(<HelpOverlay />);
    expect(screen.queryByText("Keyboard shortcuts")).not.toBeInTheDocument();

    window.dispatchEvent(new Event("helpoverlay:open"));

    expect(await screen.findByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("documents ⌘K as the palette shortcut and no longer mentions the removed 'g' binding", async () => {
    render(<HelpOverlay />);
    window.dispatchEvent(new Event("helpoverlay:open"));
    await screen.findByText("Keyboard shortcuts");

    expect(screen.getByText("⌘K")).toBeInTheDocument();
    expect(screen.queryByText("g  /  ⌘K")).not.toBeInTheDocument();
  });
});
