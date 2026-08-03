import { render, screen } from "@/test/render";
import GexChart, { strikeDomain } from "@/components/GexChart";

describe("strikeDomain", () => {
  const bars = [
    { strike: 690, gex: -1 },
    { strike: 700, gex: 2 },
    { strike: 710, gex: 3 },
  ];

  it("brackets the strikes instead of starting the axis at zero", () => {
    const [lo, hi] = strikeDomain(bars);
    // The defect this replaces: recharts' [0, 'auto'] drew 690 points of empty
    // axis, so the whole profile lived in the last tenth of the panel.
    expect(lo).toBeGreaterThan(600);
    expect(lo).toBeLessThan(690);
    expect(hi).toBeGreaterThan(710);
  });

  it("widens so the spot and zero-gamma markers stay on the chart", () => {
    const [lo, hi] = strikeDomain(bars, 750, 640);
    expect(lo).toBeLessThan(640);
    expect(hi).toBeGreaterThan(750);
  });

  it("ignores markers that are absent or not finite", () => {
    expect(strikeDomain(bars, null, undefined, NaN)).toEqual(strikeDomain(bars));
  });

  it("gives a single strike a non-zero span, which would collapse the axis", () => {
    const [lo, hi] = strikeDomain([{ strike: 700, gex: 5 }]);
    expect(hi).toBeGreaterThan(lo);
  });

  it("stays finite with no data at all", () => {
    const [lo, hi] = strikeDomain([]);
    expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("GexChart", () => {
  it("renders from a {strike, gex}[] array, not gex_profile_json", () => {
    render(
      <GexChart
        data={[
          { strike: 560, gex: -500_000 },
          { strike: 565, gex: 200_000 },
          { strike: 570, gex: 900_000 },
        ]}
      />
    );
    expect(screen.queryByText(/No GEX data/)).not.toBeInTheDocument();
  });

  it("shows an empty state for an empty array", () => {
    render(<GexChart data={[]} />);
    expect(screen.getByText(/No GEX data/)).toBeInTheDocument();
  });
});
