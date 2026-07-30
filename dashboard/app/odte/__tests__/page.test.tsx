import { render, screen, waitFor } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage } from "@/test/localStorage";
import userEvent from "@testing-library/user-event";
import OdtePage from "@/app/odte/page";

const gex = { date: "2026-07-28", symbol: "SPY", expiry: "0DTE", zero_gamma: 560, call_wall: 570, put_wall: 555, total_gex: 1_000_000 };

function mockOdte() {
  mockFetchJson({
    "/api/odte/health": { ok: true, ibkr_connected: true },
    "/api/odte/gex?symbol=SPY": gex,
    "/api/odte/pcr?symbol=SPY": { symbol: "SPY", as_of: "2026-07-28", pcr_vol: 0.9, pcr_oi: 1.0, call_vol: 100, put_vol: 90, call_oi: 200, put_oi: 200 },
    "/api/odte/unusual?symbol=SPY": { symbol: "SPY", as_of: "2026-07-28", rows: [] },
    "/api/argus/ladder/SPY?expiries=1&band=0.06": { symbol: "SPY", snap_date: "2026-07-28", spot: 565, levels: gex, expiries: [{ expiry: "0DTE", expected_move_pct: 0.8, rows: [] }] },
  });
}

describe("OdtePage — verdict cards vs. companion grid (OD-01)", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockOdte();
  });

  it("does not render a separate Companion grid section", async () => {
    render(<OdtePage />);
    await screen.findByText("Levels");
    expect(screen.queryByText("Companion grid")).not.toBeInTheDocument();
  });

  it("shows the GEX figures once, inside the Levels card's drill-down", async () => {
    const user = userEvent.setup();
    render(<OdtePage />);
    // Wait for the Levels card's stats to load so its drill-down toggle is enabled.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /levels/i })).not.toBeDisabled()
    );
    const levelsCard = (await screen.findByText("Levels")).closest("button")!;
    await user.click(levelsCard);
    expect(await screen.findByText("Gamma exposure")).toBeInTheDocument();
  });

  it("keeps <main> free of font-mono so prose renders in the body sans font, while tabular data stays monospace (OD-03)", async () => {
    render(<OdtePage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /levels/i })).not.toBeDisabled()
    );
    const main = document.querySelector("main")!;
    expect(main.className).not.toMatch(/font-mono/);
    const table = document.querySelector("table");
    if (table) expect(table.className).toMatch(/font-mono/);
  });
});
