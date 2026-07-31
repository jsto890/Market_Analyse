import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import Badge from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders the value as its visible text", () => {
    render(<Badge variant="verdict" value="LONG" />);
    expect(screen.getByText("LONG")).toBeInTheDocument();
  });

  it("maps known tier values onto --model, never P&L green", () => {
    render(<Badge variant="tier" value="PRIME_LONG" />);
    expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-model/[0.20]", "text-model");
  });

  it("PRIME_LONG is the most-saturated tier — strictly stronger tint than BREAKOUT_LONG/STANDARD_LONG", () => {
    render(
      <>
        <Badge variant="tier" value="PRIME_LONG" />
        <Badge variant="tier" value="BREAKOUT_LONG" />
        <Badge variant="tier" value="STANDARD_LONG" />
      </>
    );
    expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-model/[0.20]");
    expect(screen.getByText("BREAKOUT_LONG")).toHaveClass("bg-model/[0.14]");
    expect(screen.getByText("STANDARD_LONG")).toHaveClass("bg-model/[0.09]");
  });

  it("maps known verdict values onto --model — direction is carried by the word", () => {
    render(
      <>
        <Badge variant="verdict" value="LONG" />
        <Badge variant="verdict" value="SHORT" />
      </>
    );
    expect(screen.getByText("LONG")).toHaveClass("text-model");
    expect(screen.getByText("SHORT")).toHaveClass("text-model");
  });

  it("puts no P&L colour on any model badge", () => {
    const { container } = render(
      <>
        <Badge variant="tier" value="PRIME_LONG" />
        <Badge variant="verdict" value="SHORT" />
        <Badge variant="edge" value="HOLD/ADD" />
      </>
    );
    expect(container.innerHTML).not.toMatch(/(bg|text|border)-(pos|neg)\b/);
  });

  it("carries the raw enum on data-value, not a mouse-only title", () => {
    render(<Badge variant="tier" value="PRIME_LONG" label="Prime long" />);
    const el = screen.getByText("Prime long");
    expect(el).toHaveAttribute("data-value", "PRIME_LONG");
    expect(el).not.toHaveAttribute("title");
  });

  it("falls back to the muted token for an unknown tier value", () => {
    render(<Badge variant="tier" value="UNKNOWN_TIER" />);
    expect(screen.getByText("UNKNOWN_TIER")).toHaveClass("bg-muted/10", "text-muted");
  });
});

describe("Badge edge variant (PF-08)", () => {
  it("colors HOLD/ADD as model output and CONSIDER SELLING as a warning", () => {
    render(
      <>
        <Badge variant="edge" value="HOLD/ADD" />
        <Badge variant="edge" value="CONSIDER SELLING" />
      </>
    );
    expect(screen.getByText("HOLD/ADD").className).toContain("bg-model");
    expect(screen.getByText("CONSIDER SELLING").className).toContain("bg-warn");
  });
});
