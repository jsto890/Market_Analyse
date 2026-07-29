import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import CandleChart, { type Bar } from "@/components/charts/CandleChart";

const bars: Bar[] = [
  { ts: "2026-07-01", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { ts: "2026-07-02", open: 101, high: 103, low: 100, close: 102, volume: 1200 },
];

describe("CandleChart log-scale control", () => {
  it("is a real switch with a persistent on/off state", async () => {
    render(<CandleChart ticker="AAPL" initialBars={bars} />);
    const logSwitch = screen.getByRole("switch", { name: "Logarithmic Y-axis" });
    expect(logSwitch).toHaveAttribute("aria-checked", "false");
    await userEvent.click(logSwitch);
    expect(logSwitch).toHaveAttribute("aria-checked", "true");
  });
});
