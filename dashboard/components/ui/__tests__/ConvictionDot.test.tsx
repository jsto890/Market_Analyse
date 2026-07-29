import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import TooltipProvider from "@/components/ui/TooltipProvider";
import ConvictionDot from "@/components/ui/ConvictionDot";

function withProvider(ui: React.ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe("ConvictionDot", () => {
  it("renders an em-dash for null", () => {
    render(withProvider(<ConvictionDot value={null} />));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("wraps the dots in a keyboard-focusable tooltip trigger button", () => {
    render(withProvider(<ConvictionDot value="high" />));
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });

  it("shows the display-only caveat on hover", async () => {
    render(withProvider(<ConvictionDot value="high" />));
    await userEvent.hover(screen.getByRole("button"));
    expect((await screen.findAllByText("Display-only — not blended into the composite score")).length).toBeGreaterThan(0);
  });

  it("tints filled dots green for high conviction", () => {
    const { container } = render(withProvider(<ConvictionDot value="high" />));
    const filled = container.querySelectorAll("span[style*='background: var(--pos)']");
    expect(filled.length).toBe(3);
  });

  it("tints filled dots amber for med conviction", () => {
    const { container } = render(withProvider(<ConvictionDot value="med" />));
    const filled = container.querySelectorAll("span[style*='background: var(--warn)']");
    expect(filled.length).toBe(2);
  });

  it("tints the filled dot muted for low conviction", () => {
    const { container } = render(withProvider(<ConvictionDot value="low" />));
    const filled = container.querySelectorAll("span[style*='background: var(--muted)']");
    expect(filled.length).toBe(1);
  });
});
