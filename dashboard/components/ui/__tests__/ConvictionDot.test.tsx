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

  // Conviction is a model tier, so every filled dot is --model. The tier reads
  // from the count, never from P&L green/red.
  it.each([
    ["high", 3],
    ["med", 2],
    ["low", 1],
  ] as const)("fills %s conviction as %i model-tinted dots", (value, count) => {
    const { container } = render(withProvider(<ConvictionDot value={value} />));
    const filled = container.querySelectorAll("span[style*='background: var(--model)']");
    expect(filled.length).toBe(count);
  });

  it("never tints a dot with a P&L colour", () => {
    const { container } = render(withProvider(<ConvictionDot value="high" />));
    expect(
      container.querySelectorAll(
        "span[style*='var(--pos)'], span[style*='var(--neg)'], span[style*='var(--green)'], span[style*='var(--red)']",
      ).length,
    ).toBe(0);
  });
});
