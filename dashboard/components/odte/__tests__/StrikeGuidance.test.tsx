import { render, screen } from "@/test/render";
import StrikeGuidance from "@/components/odte/StrikeGuidance";

describe("StrikeGuidance — disclaimer (OD-02)", () => {
  it("shows the not-financial-advice disclaimer next to the actionable strikes", () => {
    render(
      <StrikeGuidance spot={565} zeroGamma={560} callWall={570} putWall={555} atm={565} emPct={0.8} />
    );
    expect(
      screen.getByText("Advisory only, not financial advice — context for your own decision, not a signal to execute.")
    ).toBeInTheDocument();
  });
});
