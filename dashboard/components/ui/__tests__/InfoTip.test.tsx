import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import TooltipProvider from "@/components/ui/TooltipProvider";
import InfoTip from "@/components/ui/InfoTip";

function withProvider(ui: React.ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe("InfoTip", () => {
  it("renders a real, keyboard-focusable <button> as the trigger", () => {
    render(withProvider(<InfoTip content="Conviction gloss" label="Conviction" />));
    const trigger = screen.getByRole("button", { name: "Conviction" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("type", "button");
  });

  it("opens the tooltip content on hover", async () => {
    render(withProvider(<InfoTip content="Conviction gloss" label="Conviction" />));
    await userEvent.hover(screen.getByRole("button", { name: "Conviction" }));
    expect((await screen.findAllByText("Conviction gloss")).length).toBeGreaterThan(0);
  });

  it("opens the tooltip content on keyboard focus (not just hover)", async () => {
    render(withProvider(<InfoTip content="Conviction gloss" label="Conviction" />));
    await userEvent.tab();
    expect((await screen.findAllByText("Conviction gloss")).length).toBeGreaterThan(0);
  });

  it("renders custom children as the trigger content instead of the default Info glyph", () => {
    render(
      withProvider(
        <InfoTip content="gloss">
          <span>C</span>
        </InfoTip>
      )
    );
    expect(screen.getByRole("button")).toHaveTextContent("C");
  });

  it("preserves aria-label when both children and label are provided", () => {
    render(
      withProvider(
        <InfoTip content="gloss" label="Conviction: high">
          <span>dots</span>
        </InfoTip>
      )
    );
    expect(screen.getByRole("button", { name: "Conviction: high" })).toBeInTheDocument();
  });
});
