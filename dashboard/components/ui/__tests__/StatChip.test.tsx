import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import StatChip from "@/components/ui/StatChip";

describe("StatChip (via @/test/render)", () => {
  it("renders label and value", () => {
    render(<StatChip label="Spot" value={565.12} />);
    expect(screen.getByText("Spot")).toBeInTheDocument();
    expect(screen.getByText("565.12")).toBeInTheDocument();
  });

  it("renders a tooltip-bearing chip without a missing-provider error", () => {
    // StatChip wraps itself in Radix Tooltip.Root when `tooltip` is set; Tooltip.Root
    // throws "`Tooltip` must be used within `TooltipProvider`" without an ancestor
    // TooltipProvider (see node_modules/@radix-ui/react-context/dist/index.js:54).
    // This only passes because @/test/render supplies that provider.
    render(<StatChip label="Fresh" value="87%" tooltip="Fraction of contracts quoted fresh in the last 2s" />);
    expect(screen.getByText("Fresh")).toBeInTheDocument();
  });
});
