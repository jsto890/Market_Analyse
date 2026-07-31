import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import OptionsPanel from "@/components/ticker/OptionsPanel";
import type { OptionsFlowData } from "@/types/argus";

function flow(overrides: Partial<OptionsFlowData> = {}): OptionsFlowData {
  return {
    symbol: "AAPL",
    expiration: "2026-08-15",
    spot: 200,
    summary: { call_oi: 1000, put_oi: 800, call_vol: 500, put_vol: 300, pcr_oi: 0.8, pcr_vol: 0.6 },
    iv_atm_call: 0.25,
    iv_atm_put: 0.27,
    iv_skew: 0.02,
    max_pain: 200,
    flags: [],
    unusual_calls_top: [{ strike: 210, lastPrice: 3.2, bid: 3.1, ask: 3.3, percentChange: 12, vol: 500, oi: 200, type: "call" }],
    unusual_puts_top: [],
    unusual_as_of: "2026-07-28",
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchJson({ "/api/argus/flow/AAPL": flow() });
});

describe("OptionsPanel", () => {
  it("renders exactly one beta-caveat line even when unusual rows exist", async () => {
    render(<OptionsPanel ticker="AAPL" />);
    await waitFor(() => expect(screen.getByText("Unusual Calls")).toBeInTheDocument());
    expect(screen.getAllByText(/robust-score \(beta\), validation pending/)).toHaveLength(1);
  });

  it("gives P/C summary and IV blocks headings matching unusual tables", async () => {
    render(<OptionsPanel ticker="AAPL" />);
    await waitFor(() => expect(screen.getByText("P/C Summary")).toBeInTheDocument());
    expect(screen.getByText("Implied Volatility")).toBeInTheDocument();
    expect(screen.getByText("Unusual Calls")).toBeInTheDocument();
  });

  it("drops the columns nothing populates (TK-08)", async () => {
    render(<OptionsPanel ticker="AAPL" />);
    await waitFor(() => expect(screen.getByText("Unusual Calls")).toBeInTheDocument());
    // Bid×Ask, Δ% and Type were em-dashes on every row of both tables.
    expect(screen.queryByText("Bid×Ask")).not.toBeInTheDocument();
    expect(screen.queryByText("Δ%")).not.toBeInTheDocument();
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
    expect(screen.getAllByText("Vol").length).toBeGreaterThan(0);
  });

  it("states the put/call ratios outside the calls-vs-puts grid (TK-09)", async () => {
    render(<OptionsPanel ticker="AAPL" />);
    await waitFor(() => expect(screen.getByText("P/C Summary")).toBeInTheDocument());
    // A ratio has no call side, so inside that grid it had to print a dash in
    // one of the two columns — which reads as a missing number.
    const oi = screen.getByText("P/C OI");
    expect(oi.closest("table")).toBeNull();
    expect(oi.parentElement).toHaveTextContent("0.80");
    expect(screen.getByText("P/C vol").parentElement).toHaveTextContent("0.60");
  });
});
