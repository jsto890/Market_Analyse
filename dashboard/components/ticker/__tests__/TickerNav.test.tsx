import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import TickerNav from "@/components/ticker/TickerNav";
import { setTickerNav } from "@/lib/tickerNav";

beforeEach(() => sessionStorage.clear());

describe("TickerNav", () => {
  it("falls back to a plain breadcrumb when no session nav state exists", async () => {
    render(<TickerNav ticker="AAPL" />);
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Previous:/)).toBeNull();
  });

  it("shows prev/next links scoped to the stored group when the ticker is in the list", async () => {
    setTickerNav("ALIGNED", ["AAPL", "NVDA", "AVGO"]);
    render(<TickerNav ticker="NVDA" />);
    expect(await screen.findByText("ALIGNED")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous: AAPL")).toHaveAttribute("href", "/t/AAPL");
    expect(screen.getByLabelText("Next: AVGO")).toHaveAttribute("href", "/t/AVGO");
  });

  it("disables the prev arrow at the start of the list and the next arrow at the end", async () => {
    setTickerNav("ALIGNED", ["AAPL", "NVDA"]);
    render(<TickerNav ticker="AAPL" />);
    await screen.findByText("ALIGNED");
    expect(screen.queryByLabelText(/Previous:/)).toBeNull();
    expect(screen.getByLabelText("Next: NVDA")).toBeInTheDocument();
  });
});
