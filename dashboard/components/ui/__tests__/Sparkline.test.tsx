import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import Sparkline from "@/components/ui/Sparkline";

describe("Sparkline", () => {
  it("labels an upward trend with the percent change", () => {
    render(<Sparkline values={[100, 102, 105, 110]} />);
    expect(screen.getByRole("img", { name: "Trend: up 10.0%" })).toBeInTheDocument();
  });

  it("labels a downward trend with the percent change", () => {
    render(<Sparkline values={[110, 108, 100]} />);
    expect(screen.getByRole("img", { name: "Trend: down 9.1%" })).toBeInTheDocument();
  });

  it("labels a flat trend when start and end are equal", () => {
    render(<Sparkline values={[50, 55, 50]} />);
    expect(screen.getByRole("img", { name: "Trend: flat" })).toBeInTheDocument();
  });

  it("renders an unlabeled empty svg when there are fewer than 2 finite values", () => {
    render(<Sparkline values={[42]} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
