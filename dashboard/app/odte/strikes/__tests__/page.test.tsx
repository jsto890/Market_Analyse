import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage } from "@/test/localStorage";
import userEvent from "@testing-library/user-event";
import OdteStrikesPage from "@/app/odte/strikes/page";

describe("OdteStrikesPage — single ladder mode (OL-02)", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockFetchJson({
      "/api/argus/ladder/SPY?expiries=4&band=0.06": {
        symbol: "SPY",
        snap_date: "2026-07-28",
        spot: 565,
        levels: { zero_gamma: 560, call_wall: 570, put_wall: 555, total_gex: 1_000_000 },
        expiries: [
          {
            expiry: "0DTE",
            expected_move_pct: 0.8,
            rows: [{ strike: 565, call: { oi: 1, vol: 1, last: 1, iv: 0.2 }, put: null, gex: 100 }],
          },
        ],
      },
      "/api/argus/options/live/SPY?expiry=0DTE": {
        symbol: "SPY",
        spot: 565,
        as_of: new Date().toISOString(),
        source: "LIVE",
        stale_ms: 0,
        fresh_contract_ratio: 1,
        expiry: "0DTE",
        levels: [
          {
            strike: 565,
            call: { bid: 1, ask: 1.1, mid: 1.05, spread_pct: 9.5, iv: 0.2, delta: 0.5, gamma: 0.01, theta: -0.05, vega: 0.2, rho: 0.1, per_dollar_gamma: 1, per_dollar_delta: 50, volume: 100, oi: 1000, stale_ms: 0, liquid: true },
            put: { bid: 0.9, ask: 1.0, mid: 0.95, spread_pct: 10.5, iv: 0.19, delta: -0.5, gamma: 0.01, theta: -0.02, vega: 0.2, rho: -0.1, per_dollar_gamma: 1, per_dollar_delta: -50, volume: 90, oi: 900, stale_ms: 0, liquid: true },
            zero_gamma_side: null,
            wall_type: null,
            gex_by_strike: 5000,
            call_gex_by_strike: 3200,
            put_gex_by_strike: 1800,
            max_pain_delta: 0,
          },
        ],
        atm_strike: 565,
        zero_gamma_strike: 560,
        call_wall_strike: 570,
        put_wall_strike: 555,
        max_pain: 564,
        pin_risk: 40,
        net_gex_band: "bullish",
        msi_call_strike: 570,
        msi_put_strike: 555,
        msi_rationale: "max concentration",
        gex_profile_json: null,
      },
    });
  });

  it("shows only the classic table when the live toggle is off", async () => {
    render(<OdteStrikesPage />);
    expect(await screen.findByText(/no data|call IV/i)).toBeInTheDocument();
    expect(screen.queryByText("C Bid")).not.toBeInTheDocument();
  });

  it("shows only the live table, never both, once the toggle is switched on", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("button", { name: /live/i }));
    await screen.findByText("C Bid");
    expect(screen.queryByText("call IV")).not.toBeInTheDocument();
  });

  it("shows independent call and put GEX values, not the same number twice (OL-03)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("button", { name: /live/i }));
    const rows = await screen.findAllByRole("row");
    const strikeRow = rows.find((r) => r.textContent?.includes("565"));
    expect(strikeRow).toBeDefined();
    const cells = strikeRow!.querySelectorAll("td");
    // Call GEX is the 11th <td> (index 10), put GEX is the last (index 21).
    expect(cells[10].textContent).not.toBe(cells[21].textContent);
  });
});
