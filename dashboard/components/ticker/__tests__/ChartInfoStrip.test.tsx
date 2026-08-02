import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import ChartInfoStrip from "@/components/ticker/ChartInfoStrip";
import type { Bar } from "@/components/charts/CandleChart";

function series(length: number): Bar[] {
  return Array.from({ length }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 1_000_000 + i * 1000,
  }));
}

/** Under `range52w`'s 60-bar floor: nothing to say about the range yet. */
const shortSeries = series(30);
/** Enough history for a 52-week range. */
const bars = series(70);

describe("ChartInfoStrip", () => {
  it("no longer reprints the header's own numbers under the chart (TK-05)", () => {
    render(<ChartInfoStrip ticker="AAPL" bars={bars} />);
    // Close, day range and volume vs average live in the header's price zone
    // now; session phase belongs to the context strip.
    expect(screen.queryByText("Session")).not.toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
    expect(screen.queryByText("Range")).not.toBeInTheDocument();
    expect(screen.queryByText("Vol")).not.toBeInTheDocument();
  });

  it("carries the 52-week range the header shed (K-12)", () => {
    render(<ChartInfoStrip ticker="AAPL" bars={bars} />);
    expect(screen.getByText("52w")).toBeInTheDocument();
    expect(screen.getByText("99.00–170.00")).toBeInTheDocument();
  });

  it("renders nothing when bars is empty", () => {
    const { container } = render(<ChartInfoStrip ticker="AAPL" bars={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the history is too short to state a range", () => {
    const { container } = render(<ChartInfoStrip ticker="AAPL" bars={shortSeries} />);
    expect(container.firstChild).toBeNull();
  });
});
