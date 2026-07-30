import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { MacroChart } from "../MacroChart";
import { CHART_HEIGHT } from "@/lib/chartConventions";

describe("MacroChart chart conventions", () => {
  it("renders nothing when there is no macro or SPY data", () => {
    const { container } = render(<MacroChart points={[]} spx={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("labels the chart for assistive tech and sizes it with the shared responsive height", () => {
    render(<MacroChart points={[{ ts: "2026-07-28 10:00:00", score: 0.2, n: 5 }]} spx={[]} />);
    const img = screen.getByRole("img", { name: "Macro sentiment score over time, overlaid on SPY" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveStyle({ height: CHART_HEIGHT });
  });
});
