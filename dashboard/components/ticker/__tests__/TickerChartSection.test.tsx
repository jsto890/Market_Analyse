import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import TickerChartSection from "@/components/ticker/TickerChartSection";
import type { BridgeRow } from "@/types/bridge";

vi.mock("@/components/charts/CandleChart", () => ({
  default: ({ ticker, period }: { ticker: string; period: string }) => (
    <div data-testid="chart">
      {ticker} {period}
    </div>
  ),
}));

const bars = [{ ts: "2026-07-02", open: 101, high: 112, low: 100, close: 110, volume: 1200 }];
const bridgeRow = { entry: 100, stop: 90, target: 120 } as BridgeRow;

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

  it("shows a no-data message and no Retry button", () => {
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
      return {
        ok: true,
        status: 200,
        json: async () => ({
          bars: [{ ts: "2026-06-01", open: 1, high: 2, low: 1, close: 1.5, volume: 100 }],
        }),
      } as Response;
    }) as typeof fetch;

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

describe("TickerChartSection panel chrome (K-11)", () => {
  it("titles the panel Chart and puts the range switch in its header", async () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={bars}
        initialStatus="ok"
        markers={[]}
      />
    );
    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.queryByText("Price & signals")).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Chart range" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "6M" })).toHaveAttribute("aria-checked", "true")
    );
  });

  it("hands the period down to the chart when the range changes", async () => {
    const user = userEvent.setup();
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={bars}
        initialStatus="ok"
        markers={[]}
      />
    );
    await waitFor(() => expect(screen.getByTestId("chart")).toHaveTextContent("AAPL 6M"));
    await user.click(screen.getByRole("radio", { name: "1Y" }));
    await waitFor(() => expect(screen.getByTestId("chart")).toHaveTextContent("AAPL 1Y"));
  });

  it("renders the info strip it is handed, under the chart", () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={bars}
        initialStatus="ok"
        markers={[]}
      >
        <div data-testid="info-strip" />
      </TickerChartSection>
    );
    expect(screen.getByTestId("info-strip")).toBeInTheDocument();
  });
});

describe("TickerChartSection read-this (K-08)", () => {
  it("describes the levels that are actually drawn", async () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={bridgeRow}
        initialBars={bars}
        initialStatus="ok"
        markers={[]}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          /Entry, stop and target are drawn on the price rather than listed beside it/
        )
      ).toBeInTheDocument()
    );
    // last close 110 against entry 100 / stop 90 / target 120
    expect(
      screen.getByText(/last close sits above entry, above stop and below target/)
    ).toBeInTheDocument();
  });

  it("renders no read-this line when there is no bridge row", () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={bars}
        initialStatus="ok"
        markers={[]}
      />
    );
    expect(screen.queryByText("Read this")).toBeNull();
  });
});
