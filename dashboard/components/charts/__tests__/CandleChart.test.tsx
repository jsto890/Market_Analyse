import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/render";
import CandleChart, { type Bar, type Level } from "@/components/charts/CandleChart";

const createPriceLine = vi.fn((_options: Record<string, unknown>) => ({}));
const removePriceLine = vi.fn();
const priceToCoordinate = vi.fn((_price: number): number | null => null);
const candleSeries = {
  setData: vi.fn(),
  setMarkers: vi.fn(),
  createPriceLine,
  removePriceLine,
  priceToCoordinate,
  applyOptions: vi.fn(),
};
const fakeSubSeries = () => ({ setData: vi.fn(), applyOptions: vi.fn() });
const fakeScale = () => ({
  applyOptions: vi.fn(),
  setVisibleRange: vi.fn(),
  fitContent: vi.fn(),
  subscribeVisibleTimeRangeChange: vi.fn(),
});
const fakeChart = {
  addCandlestickSeries: vi.fn(() => candleSeries),
  addHistogramSeries: vi.fn(() => fakeSubSeries()),
  addLineSeries: vi.fn(() => fakeSubSeries()),
  priceScale: vi.fn(() => fakeScale()),
  timeScale: vi.fn(() => fakeScale()),
  subscribeCrosshairMove: vi.fn(),
  applyOptions: vi.fn(),
  resize: vi.fn(),
  remove: vi.fn(),
};

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => fakeChart),
  ColorType: { Solid: "solid" },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
}));

const bars: Bar[] = [
  { ts: "2026-07-01", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { ts: "2026-07-02", open: 101, high: 103, low: 100, close: 102, volume: 1200 },
];

beforeEach(() => {
  createPriceLine.mockClear();
  removePriceLine.mockClear();
  // Off-scale by default: the chips only render for prices the scale can place,
  // and most of these tests are not about the chips.
  priceToCoordinate.mockClear();
  priceToCoordinate.mockReturnValue(null);
});

describe("CandleChart log-scale control", () => {
  it("is a real switch with a persistent on/off state", async () => {
    render(<CandleChart ticker="AAPL" initialBars={bars} period="6M" />);
    const logSwitch = screen.getByRole("switch", { name: "Logarithmic Y-axis" });
    expect(logSwitch).toHaveAttribute("aria-checked", "false");
    await userEvent.click(logSwitch);
    expect(logSwitch).toHaveAttribute("aria-checked", "true");
  });
});

describe("CandleChart price lines (TK-02, K-08)", () => {
  it("draws a line per level plus one for the last price", async () => {
    const levels: Level[] = [
      { price: 10, kind: "entry" },
      { price: 9, kind: "stop" },
    ];
    render(<CandleChart ticker="NVDA" initialBars={bars} period="6M" levels={levels} />);
    await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(3));
  });

  it("draws only the last price when the scorer issued no levels", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} period="6M" />);
    await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(1));
    expect(createPriceLine.mock.lastCall?.[0]).toMatchObject({ price: 102, lineStyle: 0 });
  });

  it("removes stale price lines and redraws when the levels prop changes", async () => {
    const { rerender } = render(
      <CandleChart ticker="NVDA" initialBars={bars} period="6M" levels={[{ price: 10, kind: "entry" }]} />
    );
    await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(2));

    rerender(
      <CandleChart ticker="NVDA" initialBars={bars} period="6M" levels={[{ price: 12, kind: "stop" }]} />
    );
    await waitFor(() => expect(removePriceLine).toHaveBeenCalledTimes(2));
    expect(createPriceLine).toHaveBeenCalledTimes(4);
  });

  it("names each line in a chip at the right edge (K-08)", async () => {
    priceToCoordinate.mockImplementation((price: number) => 400 - price);
    const levels: Level[] = [
      { price: 120, kind: "target" },
      { price: 100, kind: "entry" },
      { price: 90, kind: "stop" },
    ];
    render(<CandleChart ticker="NVDA" initialBars={bars} period="6M" levels={levels} />);
    await waitFor(() => expect(screen.getByText("T 120.00")).toBeInTheDocument());
    expect(screen.getByText("E 100.00")).toBeInTheDocument();
    expect(screen.getByText("S 90.00")).toBeInTheDocument();
    // the last price carries the number alone, on --raised rather than a tint —
    // twice on screen: once in the OHLC legend, once as the chip
    expect(screen.getAllByText("102.00")).toHaveLength(2);
  });

  it("draws no chip for a level the scale cannot place", async () => {
    priceToCoordinate.mockImplementation((price: number) => (price === 90 ? null : 400 - price));
    render(
      <CandleChart
        ticker="NVDA"
        initialBars={bars}
        period="6M"
        levels={[
          { price: 100, kind: "entry" },
          { price: 90, kind: "stop" },
        ]}
      />
    );
    await waitFor(() => expect(screen.getByText("E 100.00")).toBeInTheDocument());
    expect(screen.queryByText("S 90.00")).toBeNull();
  });
});

describe("CandleChart controls + OHLC legend (TK-12, TK-13, K-11)", () => {
  it("leaves the range switch to the panel header and keeps the EMA chips", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} period="6M" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "20" })).toHaveAttribute("aria-pressed", "true")
    );
    expect(screen.queryByRole("radiogroup", { name: "Chart range" })).toBeNull();
  });

  it("seeds the OHLC legend from the last bar on mount", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} period="6M" />);
    await waitFor(() => expect(screen.getByText("102.00")).toBeInTheDocument());
  });

  it("shows a Vol label on the volume pane", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} period="6M" />);
    await waitFor(() => expect(screen.getByText("Vol")).toBeInTheDocument());
  });
});
