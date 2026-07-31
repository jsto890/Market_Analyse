import { render, screen } from "@/test/render";
import GexChart from "@/components/GexChart";

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
