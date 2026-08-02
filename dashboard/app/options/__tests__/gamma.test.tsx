import { render, screen, within } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage } from "@/test/localStorage";
import OptionsGammaPage from "@/app/options/gamma/page";

const LADDER_URL = "/api/argus/ladder/SPY?expiries=4&band=0.5";

/** 15 strikes around a 565 spot, dealer-signed: short below the flip, long
 *  above it, heaviest block on the call wall. */
function rows(gexAt: (strike: number) => number) {
  return Array.from({ length: 15 }, (_, i) => {
    const strike = 558 + i;
    return {
      strike,
      call: { oi: 100, vol: 50, last: 1, iv: 0.2 },
      put: { oi: 90, vol: 40, last: 1, iv: 0.21 },
      gex: gexAt(strike),
    };
  });
}

const PROFILE = rows((k) => {
  if (k < 562) return -1_000_000 * (562 - k);
  if (k === 570) return 4_000_000; // the call wall is the heaviest block
  return 1_000_000 * Math.min(k - 561, 3);
});

const LEVELS = { zero_gamma: 562, call_wall: 570, put_wall: 558, total_gex: -100_000_000 };

function ladder(over: Record<string, unknown> = {}) {
  return {
    symbol: "SPY",
    snap_date: "2026-08-01",
    spot: 565,
    levels: LEVELS,
    expiries: [
      { expiry: "2026-08-01", expected_move_pct: 0.8, rows: PROFILE },
      { expiry: "2026-08-04", expected_move_pct: 1.1, rows: rows(() => 2_000_000) },
      { expiry: "2026-08-08", expected_move_pct: 1.4, rows: rows(() => -3_000_000) },
    ],
    ...over,
  };
}

describe("OptionsGammaPage", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockFetchJson({
      "/api/odte/health": { ok: true, ibkr_connected: true },
      [LADDER_URL]: ladder(),
    });
  });

  it("states the regime, its sub-line and the spot-vs-flip scale (O-01)", async () => {
    render(<OptionsGammaPage />);
    // Spot 565 sits above the 562 flip, so deriveLevels reads "good".
    expect(
      await screen.findByText("Long gamma", { selector: "div.text-display" })
    ).toBeInTheDocument();
    expect(screen.getByText("Dealers dampen moves")).toBeInTheDocument();
    expect(screen.getByText("zero-γ 562")).toBeInTheDocument();
    expect(screen.getByText("spot 565.00")).toBeInTheDocument();
    expect(screen.getByText("· moves extend")).toBeInTheDocument();
    expect(screen.getByText("· moves pin")).toBeInTheDocument();
    expect(screen.getByText(/3.00 points of cushion/)).toBeInTheDocument();
    expect(screen.getByText("−0.10B")).toBeInTheDocument();
  });

  it("prints the axis the bars are drawn against (O-02)", async () => {
    render(<OptionsGammaPage />);
    expect(await screen.findByText("Gamma exposure by strike")).toBeInTheDocument();
    expect(screen.getByText("$M per 1% move · 1 Aug")).toBeInTheDocument();
    // Peak is the 4M call wall, so the printed scale is ±5M and every bar is
    // value / 5 × 50% of the half-width.
    expect(screen.getByText("−5.0")).toBeInTheDocument();
    expect(screen.getByText("+5.0")).toBeInTheDocument();
    expect(screen.getByText("+2.5")).toBeInTheDocument();
    for (const tag of ["ZG", "CW", "PW", "ATM"]) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
  });

  it("gives every level its sentence in the row, not in a tooltip (O-02)", async () => {
    render(<OptionsGammaPage />);
    expect(await screen.findByText("Levels")).toBeInTheDocument();
    expect(
      screen.getByText("The sign flip. Above it hedging absorbs moves; below it hedging feeds them.")
    ).toBeInTheDocument();
    expect(screen.getByText(/a magnet on approach, resistance on arrival/)).toBeInTheDocument();
    expect(screen.getByText(/an air pocket once it breaks/)).toBeInTheDocument();
    expect(document.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("writes the other side of the flip before it happens (O-02)", async () => {
    render(<OptionsGammaPage />);
    expect(await screen.findByText("If spot breaks 562")).toBeInTheDocument();
    expect(screen.getByText(/Regime inverts to short gamma/)).toBeInTheDocument();
    expect(screen.getByText(/558 put wall to act as an accelerant/)).toBeInTheDocument();
  });

  it("renders nothing at all for a level with no feed", async () => {
    mockFetchJson({
      "/api/odte/health": { ok: true, ibkr_connected: true },
      [LADDER_URL]: ladder({ levels: { ...LEVELS, zero_gamma: null, put_wall: null } }),
    });
    render(<OptionsGammaPage />);
    const card = (await screen.findByText("Levels")).closest("section")!;
    expect(within(card).getByText("Call wall")).toBeInTheDocument();
    expect(within(card).queryByText("Zero gamma")).not.toBeInTheDocument();
    expect(within(card).queryByText("Put wall")).not.toBeInTheDocument();
    expect(within(card).queryByText("—")).not.toBeInTheDocument();
    // No flip means no regime and no scenario — not a dashed one.
    expect(screen.queryByText("Regime now")).not.toBeInTheDocument();
    expect(screen.queryByText(/If spot/)).not.toBeInTheDocument();
  });

  it("leaves max pain out until the live ladder carries one", async () => {
    render(<OptionsGammaPage />);
    await screen.findByText("Levels");
    expect(screen.queryByText("Max pain")).not.toBeInTheDocument();
    expect(screen.queryByText("pin risk")).not.toBeInTheDocument();
  });
});
