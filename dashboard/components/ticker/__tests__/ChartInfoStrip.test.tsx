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
  it("renders discrete labelled chips", () => {
    render(<ChartInfoStrip ticker="AAPL" bars={bars} />);
    expect(screen.getByText("Session")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.getByText("Range")).toBeInTheDocument();
    const last = bars[bars.length - 1];
    expect(screen.getByText(last.close.toFixed(2))).toBeInTheDocument();
  });

  it("renders nothing when bars is empty", () => {
    const { container } = render(<ChartInfoStrip ticker="AAPL" bars={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
