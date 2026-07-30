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
        levels: [],
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
});
