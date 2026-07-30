import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import Badge from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders the value as its visible text", () => {
    render(<Badge variant="verdict" value="LONG" />);
    expect(screen.getByText("LONG")).toBeInTheDocument();
  });

  it("maps known tier values to their token classes", () => {
    render(<Badge variant="tier" value="PRIME_LONG" />);
    expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-pos/25", "text-pos");
  });

  it("PRIME_LONG is the most-saturated tier — strictly stronger tint than BREAKOUT_LONG/STANDARD_LONG", () => {
    render(
      <>
        <Badge variant="tier" value="PRIME_LONG" />
        <Badge variant="tier" value="BREAKOUT_LONG" />
        <Badge variant="tier" value="STANDARD_LONG" />
      </>
    );
    expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-pos/25");
    expect(screen.getByText("BREAKOUT_LONG")).toHaveClass("bg-pos/15");
    expect(screen.getByText("STANDARD_LONG")).toHaveClass("bg-pos/12");
  });

  it("maps known verdict values to their token classes", () => {
    render(<Badge variant="verdict" value="SHORT" />);
    expect(screen.getByText("SHORT")).toHaveClass("bg-neg/15", "text-neg");
  });

  it("falls back to the muted token for an unknown tier value", () => {
    render(<Badge variant="tier" value="UNKNOWN_TIER" />);
    expect(screen.getByText("UNKNOWN_TIER")).toHaveClass("bg-muted/15", "text-muted");
  });
});

describe("Badge edge variant (PF-08)", () => {
  it("colors HOLD/ADD positively and CONSIDER SELLING as a warning", () => {
    render(
      <>
        <Badge variant="edge" value="HOLD/ADD" />
        <Badge variant="edge" value="CONSIDER SELLING" />
      </>
    );
    expect(screen.getByText("HOLD/ADD").className).toContain("bg-pos");
    expect(screen.getByText("CONSIDER SELLING").className).toContain("bg-warn");
  });
});
