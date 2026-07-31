import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import TickerChartSection from "@/components/ticker/TickerChartSection";

vi.mock("@/components/charts/CandleChart", () => ({
  default: ({ ticker }: { ticker: string }) => <div data-testid="chart">{ticker}</div>,
}));

beforeEach(() => {
  mockFetchJson({ "/api/action_card/AAPL": {} });
});

describe("TickerChartSection", () => {
  it("shows a timeout-specific message and a Retry button", () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={[]}
        initialStatus="timeout"
        markers={[]}
      />
    );
    expect(screen.getByText(/timed out/)).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows a no-data message with no Retry button", () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={[]}
        initialStatus="no-data"
        markers={[]}
      />
    );
    expect(screen.getByText("No price history")).toBeInTheDocument();
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("renders the chart on a successful retry after a timeout", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/action_card/")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ bars: [{ ts: "2026-06-01", open: 1, high: 2, low: 1, close: 1.5, volume: 100 }] }) } as Response;
    });

    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={[]}
        initialStatus="timeout"
        markers={[]}
      />
    );
    await user.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByTestId("chart")).toBeInTheDocument());
  });
});
