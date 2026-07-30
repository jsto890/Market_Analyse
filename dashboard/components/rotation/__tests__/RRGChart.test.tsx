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

describe("RRGChart hidden sectors (RO-06)", () => {
  it("names the hidden (flat/no-data) sectors instead of only counting them", () => {
    const withHidden: RotationRow[] = [
      rows[0],
      { industry: "Discretionary", quadrant: "lagging", rs_ratio: 100.01, rs_mom: 99.98, breadth: null, n: null, r1w: null, r1m: null, r3m: null, rank: 2, drank: 0 },
    ];
    render(<RRGChart rows={withHidden} />);
    expect(screen.getByText(/Hidden \(flat\/no data\): Discretionary/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Relative Rotation Graph scatter plot, 1 sectors" })).toBeInTheDocument();
  });

  it("shows no hidden-sectors line when every row plots", () => {
    render(<RRGChart rows={[rows[0]]} />);
    expect(screen.queryByText(/Hidden \(flat\/no data\)/)).not.toBeInTheDocument();
  });
});

describe("RRGChart label decluttering (RO-07)", () => {
  it("mounts cleanly when several sectors cluster at nearly the same RS-Ratio/RS-Mom", () => {
    const clustered: RotationRow[] = [
      { industry: "Energy", quadrant: "leading", rs_ratio: 101, rs_mom: 101, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
      { industry: "Materials", quadrant: "leading", rs_ratio: 101.2, rs_mom: 101.3, breadth: 55, n: 28, r1w: 1, r1m: 2, r3m: 3, rank: 2, drank: 0 },
      { industry: "Industrials", quadrant: "leading", rs_ratio: 101.4, rs_mom: 100.9, breadth: 58, n: 27, r1w: 1, r1m: 2, r3m: 3, rank: 3, drank: 0 },
    ];
    render(<RRGChart rows={clustered} />);
    expect(screen.getByRole("img", { name: "Relative Rotation Graph scatter plot, 3 sectors" })).toBeInTheDocument();
  });
});
