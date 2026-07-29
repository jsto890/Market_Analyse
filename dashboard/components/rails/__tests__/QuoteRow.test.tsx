import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { QuoteRow } from "@/components/rails/QuoteRow";

describe("QuoteRow", () => {
  it("is a link to /t/[symbol] so a rail row navigates like every other ticker string (LR-03)", () => {
    render(<QuoteRow symbol="SPY" price={500} changePct={0.5} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/t/SPY");
  });

  it("skeleton rows are not links (no real data to navigate to yet)", () => {
    render(<QuoteRow symbol="SPY" price={0} changePct={0} skeleton />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
