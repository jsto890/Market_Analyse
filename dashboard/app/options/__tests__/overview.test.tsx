import { render, screen, waitFor } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage } from "@/test/localStorage";
import userEvent from "@testing-library/user-event";
import OptionsOverviewPage from "@/app/options/page";

const gex = {
  date: "2026-07-31",
  symbol: "SPY",
  expiry: "0DTE",
  zero_gamma: 560,
  call_wall: 570,
  put_wall: 555,
  total_gex: 1_000_000,
};

describe("OptionsOverviewPage", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockFetchJson({
      "/api/odte/health": { ok: true, ibkr_connected: true },
      "/api/odte/gex?symbol=SPY": gex,
      "/api/odte/pcr?symbol=SPY": {
        symbol: "SPY", as_of: "2026-07-31", pcr_vol: 0.9, pcr_oi: 1.0,
        call_vol: 100, put_vol: 90, call_oi: 200, put_oi: 200,
      },
      "/api/odte/unusual?symbol=SPY": { symbol: "SPY", as_of: "2026-07-31", rows: [] },
      "/api/argus/ladder/SPY?expiries=1&band=0.06": {
        symbol: "SPY", snap_date: "2026-07-31", spot: 565, levels: gex,
        expiries: [
          {
            expiry: "0DTE",
            expected_move_pct: 0.8,
            rows: [
              {
                strike: 565,
                call: { oi: 100, vol: 50, last: 1, iv: 0.2 },
                put: { oi: 90, vol: 40, last: 1, iv: 0.24 },
                gex: 1000,
              },
            ],
          },
        ],
      },
    });
  });

  it("keeps the four verdict cards", async () => {
    render(<OptionsOverviewPage />);
    await screen.findByText("Levels");
    for (const title of ["Spot / Regime", "Levels", "Shape / Skew", "Flow / Stats"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("routes onward into the split tree rather than the old strikes page (OPT-07)", async () => {
    render(<OptionsOverviewPage />);
    await screen.findByText("Levels");
    expect(screen.getByRole("link", { name: /open ladder/i })).toHaveAttribute(
      "href",
      "/options/ladder"
    );
  });

  it("hands the deep dives off to their own tabs", async () => {
    const user = userEvent.setup();
    render(<OptionsOverviewPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /shape \/ skew/i })).not.toBeDisabled()
    );
    await user.click(screen.getByRole("button", { name: /shape \/ skew/i }));
    expect(await screen.findByRole("link", { name: /full skew/i })).toHaveAttribute(
      "href",
      "/options/gamma"
    );
  });

  it("leaves the symbol switcher and health badge to the shared layout", async () => {
    render(<OptionsOverviewPage />);
    await screen.findByText("Levels");
    expect(screen.queryByRole("switch", { name: /live ladder/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/IBKR disconnected|Service down/)).not.toBeInTheDocument();
  });
});
