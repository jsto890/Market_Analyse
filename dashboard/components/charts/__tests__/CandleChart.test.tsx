import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/render";
import CandleChart, { type Bar, type Level } from "@/components/charts/CandleChart";

const createPriceLine = vi.fn(() => ({}));
const removePriceLine = vi.fn();
const candleSeries = {
  setData: vi.fn(),
  setMarkers: vi.fn(),
  createPriceLine,
  removePriceLine,
  applyOptions: vi.fn(),
};
const fakeSubSeries = () => ({ setData: vi.fn(), applyOptions: vi.fn() });
const fakeScale = () => ({ applyOptions: vi.fn(), setVisibleRange: vi.fn(), fitContent: vi.fn() });
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
});

describe("CandleChart log-scale control", () => {
  it("is a real switch with a persistent on/off state", async () => {
    render(<CandleChart ticker="AAPL" initialBars={bars} />);
    const logSwitch = screen.getByRole("switch", { name: "Logarithmic Y-axis" });
    expect(logSwitch).toHaveAttribute("aria-checked", "false");
    await userEvent.click(logSwitch);
    expect(logSwitch).toHaveAttribute("aria-checked", "true");
  });
});

describe("CandleChart price lines (TK-02)", () => {
  it("draws one price line per level on mount", async () => {
    const levels: Level[] = [
      { price: 10, kind: "entry" },
      { price: 9, kind: "stop" },
    ];
    render(<CandleChart ticker="NVDA" initialBars={bars} levels={levels} />);
    await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(2));
  });

  it("removes stale price lines and redraws when the levels prop changes", async () => {
    const { rerender } = render(
      <CandleChart ticker="NVDA" initialBars={bars} levels={[{ price: 10, kind: "entry" }]} />
    );
    await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(1));

    rerender(<CandleChart ticker="NVDA" initialBars={bars} levels={[{ price: 12, kind: "stop" }]} />);
    await waitFor(() => expect(removePriceLine).toHaveBeenCalledTimes(1));
    expect(createPriceLine).toHaveBeenCalledTimes(2);
  });
});

describe("CandleChart controls + OHLC legend (TK-12, TK-13)", () => {
  it("exposes range pills as a radiogroup and EMA chips as pressed toggles", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} />);
    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Chart range" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "6M" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "20" })).toHaveAttribute("aria-pressed", "true");
  });

  it("seeds the OHLC legend from the last bar on mount", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} />);
    await waitFor(() => expect(screen.getByText("102.00")).toBeInTheDocument());
  });

  it("shows a Vol label on the volume pane", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} />);
    await waitFor(() => expect(screen.getByText("Vol")).toBeInTheDocument());
  });
});
