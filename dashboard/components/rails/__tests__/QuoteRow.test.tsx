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

describe("QuoteRow tracks (R-07)", () => {
  it("holds equities to 42 / flex / 54 so the change column starts at one x", () => {
    const { container } = render(<QuoteRow symbol="SPY" price={638.2} changePct={1.86} />);
    const row = container.querySelector("a")!;
    expect(row.className).toContain("h-[27px]");
    expect(screen.getByText("SPY").className).toContain("w-[42px]");
    expect(screen.getByText("638.20").className).toContain("flex-1");
    expect(screen.getByText("+1.86%").className).toContain("w-[54px]");
  });

  it("gives forex its own pair — a wider label, a narrower change", () => {
    render(<QuoteRow symbol="EURUSD=X" price={1.0842} changePct={0.21} />);
    expect(screen.getByText("EUR/USD").className).toContain("w-[56px]");
    expect(screen.getByText("+0.21%").className).toContain("w-[52px]");
  });

  it("skeleton rows reserve the same tracks, so nothing shifts when quotes land", () => {
    const { container } = render(<QuoteRow symbol="EURUSD=X" price={0} changePct={0} skeleton />);
    expect(container.querySelector(".h-\\[27px\\]")).toBeInTheDocument();
    expect(screen.getByText("EUR/USD").className).toContain("w-[56px]");
    expect(container.querySelector(".w-\\[52px\\]")).toBeInTheDocument();
  });
});
