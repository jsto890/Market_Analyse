import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import RRGChart from "../RRGChart";
import { CHART_HEIGHT } from "@/lib/chartConventions";
import type { RotationRow } from "@/components/today/RotationPanel";

const rows: RotationRow[] = [
  { industry: "Energy", quadrant: "leading", rs_ratio: 105, rs_mom: 102, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
  { industry: "Utilities", quadrant: "lagging", rs_ratio: 95, rs_mom: 90, breadth: 20, n: 25, r1w: -1, r1m: -2, r3m: -3, rank: 2, drank: 0 },
];

describe("RRGChart chart conventions", () => {
  it("labels the plot for assistive tech with the plotted sector count", () => {
    render(<RRGChart rows={rows} />);
    expect(screen.getByRole("img", { name: "Relative Rotation Graph scatter plot, 2 sectors" })).toBeInTheDocument();
  });

  it("sizes the chart with the shared responsive height, not a fixed pixel value", () => {
    render(<RRGChart rows={rows} />);
    expect(screen.getByRole("img")).toHaveStyle({ height: CHART_HEIGHT });
  });
});
