import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import DiffStrip from "@/components/today/DiffStrip";

const DIFF = {
  newTickers: ["NVDA"],
  dropped: [],
  groupMoves: [],
  sentimentTurns: [],
};

describe("DiffStrip", () => {
  beforeEach(() => resetLocalStorage());

  it("is open by default and collapses on trigger click", async () => {
    render(<DiffStrip diff={DIFF} />);
    const trigger = screen.getByRole("button", { name: /Changes since yesterday/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("persists state under dash:collapsible:diff, not the legacy dash:panel:diff key", async () => {
    render(<DiffStrip diff={DIFF} />);
    await userEvent.click(screen.getByRole("button", { name: /Changes since yesterday/ }));
    expect(localStorage.getItem("dash:collapsible:diff")).toBe("false");
    expect(localStorage.getItem("dash:panel:diff")).toBeNull();
  });

  it("migrates a pre-existing legacy dash:panel:diff value forward (one-time)", async () => {
    localStorage.setItem("dash:panel:diff", "false");
    render(<DiffStrip diff={DIFF} />);
    const trigger = await screen.findByRole("button", { name: /Changes since yesterday/, expanded: false });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem("dash:collapsible:diff")).toBe("false");
    expect(localStorage.getItem("dash:panel:diff")).toBeNull();
  });
});
