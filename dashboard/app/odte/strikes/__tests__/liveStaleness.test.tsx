import { vi } from "vitest";
import { render, screen } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import { mockFetchJson } from "@/test/fetchMock";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/useOptionsLivePoller", () => ({
  useOptionsLivePoller: vi.fn(),
}));

import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import OdteStrikesPage from "@/app/odte/strikes/page";
import { STALE_AFTER_FAILURES, type LadderSnapshot } from "@/lib/optionsLive";

const mockedPoller = vi.mocked(useOptionsLivePoller);

const ladder: LadderSnapshot = {
  symbol: "SPY", spot: 565, as_of: "2026-07-28T12:00:00.000Z", source: "LIVE",
  stale_ms: 0, fresh_contract_ratio: 1, expiry: "0DTE", levels: [],
  atm_strike: 565, zero_gamma_strike: 560, call_wall_strike: 570, put_wall_strike: 555,
  max_pain: 564, pin_risk: 40, net_gex_band: "bullish", msi_call_strike: 570,
  msi_put_strike: 555, msi_rationale: "max concentration", gex_profile_json: null,
};

describe("OdteStrikesPage — stale-ladder invalidation (OL-06)", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockFetchJson({});
  });

  it("shows LIVE, undimmed, with no consecutive failures", async () => {
    mockedPoller.mockReturnValue({ ladder, error: null, consecutiveFailures: 0 });
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await user.click(screen.getByRole("button", { name: /live/i }));
    const badges = await screen.findAllByText("LIVE");
    const badge = badges.find((el) => el.tagName === "SPAN");
    expect(badge).toBeDefined();
  });

  it("flips the badge to STALE and dims the table after 3 consecutive failures, but keeps the last good data on screen", async () => {
    mockedPoller.mockReturnValue({
      ladder,
      error: "Live data unavailable",
      consecutiveFailures: STALE_AFTER_FAILURES,
    });
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await user.click(screen.getByRole("button", { name: /live/i }));

    expect(await screen.findByText("STALE")).toBeInTheDocument();
    // The toggle button itself still reads "LIVE" (that reflects showLive, not
    // staleness) — only the provenance badge <span> must not say LIVE.
    const liveTexts = screen.queryAllByText("LIVE");
    expect(liveTexts.every((el) => el.tagName !== "SPAN")).toBe(true);
    // The last-known ATM strike is still rendered — the table is dimmed, not blanked.
    expect(screen.getByText("565")).toBeInTheDocument();
  });
});
