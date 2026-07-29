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
    expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-warn/20", "text-warn");
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
