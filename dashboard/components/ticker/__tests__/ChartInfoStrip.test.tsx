import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import ChartInfoStrip from "@/components/ticker/ChartInfoStrip";
import type { Bar } from "@/components/charts/CandleChart";

const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({
  ts: `2026-06-${String(i + 1).padStart(2, "0")}`,
  open: 100 + i,
  high: 101 + i,
  low: 99 + i,
  close: 100.5 + i,
  volume: 1_000_000 + i * 1000,
}));

describe("ChartInfoStrip", () => {
  it("no longer reprints the header's own numbers under the chart (TK-05)", () => {
    render(<ChartInfoStrip ticker="AAPL" bars={bars} />);
    // Close, day range, volume vs average and 52w all live in the header's
    // price zone now; session phase belongs to the context strip.
    expect(screen.queryByText("Session")).not.toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
    expect(screen.queryByText("Range")).not.toBeInTheDocument();
    expect(screen.queryByText("Vol")).not.toBeInTheDocument();
    expect(screen.queryByText("52w")).not.toBeInTheDocument();
  });

  it("renders nothing when bars is empty", () => {
    const { container } = render(<ChartInfoStrip ticker="AAPL" bars={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing outside pre/after hours, when it has nothing to add", () => {
    const { container } = render(<ChartInfoStrip ticker="AAPL" bars={bars} />);
    expect(container.firstChild).toBeNull();
  });
});
