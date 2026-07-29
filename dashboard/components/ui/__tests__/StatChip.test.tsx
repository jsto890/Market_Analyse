import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import TooltipProvider from "@/components/ui/TooltipProvider";
import StatChip from "@/components/ui/StatChip";

function withProvider(ui: React.ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe("StatChip", () => {
  it("renders label and value with no tooltip wrapper when tooltip is omitted", () => {
    render(<StatChip label="n_eff" value="42" />);
    expect(screen.getByText("n_eff")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies the tone color class to the value", () => {
    render(<StatChip label="Δrank" value="+3" tone="pos" />);
    expect(screen.getByText("+3")).toHaveClass("text-pos");
  });

  it("wraps in a keyboard-focusable button when tooltip is supplied", async () => {
    render(withProvider(<StatChip label="n_eff" value="42" tooltip="Effective sample size after correlation shrinkage" />));
    const trigger = screen.getByRole("button");
    expect(trigger.tagName).toBe("BUTTON");
    await userEvent.hover(trigger);
    expect((await screen.findAllByText("Effective sample size after correlation shrinkage")).length).toBeGreaterThan(0);
  });
});
