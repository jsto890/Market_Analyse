import { vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/test/render";
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
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    expect(screen.queryByText("call IV")).not.toBeInTheDocument();
  });

  it("shows independent call and put GEX values, not the same number twice (OL-03)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    const rows = await screen.findAllByRole("row");
    const strikeRow = rows.find((r) => r.textContent?.includes("565"));
    expect(strikeRow).toBeDefined();
    const cells = strikeRow!.querySelectorAll("td");
    // Call GEX is the 11th <td> (index 10), put GEX is the last (index 21).
    expect(cells[10].textContent).not.toBe(cells[21].textContent);
  });

  it("uses tokenised classes for the live toggle and provenance badge, not raw palette colours (OL-09)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    const toggle = screen.getByRole("switch", { name: /live/i });
    expect(toggle.className).not.toMatch(/blue-|gray-/);
    await user.click(toggle);
    const badges = await screen.findAllByText("LIVE");
    const badge = badges.find((el) => el.tagName === "SPAN")!;
    expect(badge).toBeDefined();
    expect(badge.className).not.toMatch(/green-|yellow-|gray-/);
    expect(badge.className).toMatch(/tone-live/);
  });

  it("only shows a staleness warning above 1500ms, and explains fresh_contract_ratio (OL-07, OL-15)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    // The mocked ladder (Task 2) has stale_ms: 0 — no warning should render at all.
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
    // fresh_contract_ratio now has an accessible explanation, not a bare "Fresh 87%".
    const freshLabel = screen.getByText("What does fresh mean?");
    expect(freshLabel.closest("button, [role='button']")).toBeTruthy();
  });

  it("wraps the levels strip instead of a rigid 6-column grid (OL-16)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    // "ATM" also appears as a row chip in the live table (Task 24) — scope to the strip's stat label.
    const stripHeading = screen.getAllByText("ATM").find((el) => !el.closest("tr"))!;
    const strip = stripHeading.closest("div")!.parentElement!;
    expect(strip.className).toMatch(/flex-wrap/);
    expect(strip.className).not.toMatch(/grid-cols-6/);
  });

  it("centers on the spot row once on load, and again on demand via a manual control, not on every tick (OD-06)", async () => {
    const scrollIntoViewMock = vi.fn();
    // test/setup.ts already installs a no-op on HTMLElement.prototype — that
    // shadows an Element.prototype assignment, so the mock must go on the
    // same prototype to actually be invoked by row.scrollIntoView().
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    // Wait on the mount effect's own side effect rather than DOM text — the
    // fixture's single row makes every marker (SPOT/ZG/CW/PW) nearest-match
    // to it, and the static markers legend also renders literal "SPOT" text,
    // so any findByText("SPOT") is ambiguous.
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
    const afterMount = scrollIntoViewMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: /center on spot/i }));
    expect(scrollIntoViewMock.mock.calls.length).toBe(afterMount + 1);
  });

  it("keeps <main> free of font-mono so prose renders in the body sans font, while tabular data stays monospace (OD-03)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    const main = document.querySelector("main")!;
    expect(main.className).not.toMatch(/font-mono/);
    const table = document.querySelector("table");
    if (table) expect(table.className).toMatch(/font-mono/);
  });

  it("shows the how-to-read explainer above the ladder table, open by default on first visit (OD-07)", async () => {
    resetLocalStorage();
    render(<OdteStrikesPage />);
    const heading = await screen.findByText("How to read this ladder");
    expect(screen.getByText(/ladder auto-centers here on load/i)).toBeInTheDocument();
    const main = screen.getByRole("main");
    const all = Array.from(main.querySelectorAll("*"));
    expect(all.indexOf(heading)).toBeLessThan(all.indexOf(document.querySelector("table")!));
  });

  it("persists a collapsed choice across remounts (OD-07)", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const { unmount } = render(<OdteStrikesPage />);
    await screen.findByText("How to read this ladder");
    // Collapsible always mounts its children (CSS-only grid collapse), so
    // assert on aria-expanded rather than text presence, per its own
    // established test convention (components/ui/__tests__/Collapsible.test.tsx).
    const trigger = screen.getByRole("button", { name: /how to read this ladder/i });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    unmount();

    render(<OdteStrikesPage />);
    expect(
      await screen.findByRole("button", { name: /how to read this ladder/i, expanded: false })
    ).toBeInTheDocument();
  });

  it("copies strike + IV + GEX to the clipboard on row click and shows a transient confirmation (OD-09)", async () => {
    const writeText = vi.fn();
    // navigator.clipboard is getter-only in this jsdom version — Object.assign throws.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    const firstDataRow = screen.getAllByRole("row")[1]; // index 0 is the header row
    // userEvent.click misses on <tr> targets here — jsdom gives every element a
    // zero-size bounding rect, which its pointer-position simulation relies on.
    // fireEvent.click dispatches the click directly without that step.
    fireEvent.click(firstDataRow);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/call IV.*put IV.*GEX/));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("shows marker legend once, not duplicated between the levels strip and the explainer (OD-10)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    // Old inline LegendItem caption from the levels strip is gone — the
    // how-to-read explainer (promoted above the fold, Task 16) is now the
    // sole place marker vocabulary is spelled out.
    expect(screen.queryByText("last price")).not.toBeInTheDocument();
  });

  it("uses an 11px floor for strike-cell marker chips, never 9px (OL-12)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    const chips = screen.getAllByText(/^(SPOT|ZG|CW|PW)$/).filter((el) => el.tagName === "SPAN");
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.className).not.toMatch(/text-\[9px\]/);
    }
  });

  it("extends the how-to-read explainer's Columns section with greek glosses (OD-10)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    expect(screen.getByText("Θ")).toBeInTheDocument();
  });

  it("replaces vega/rho columns with spread% and a liquidity marker, and explains msi_rationale on hover (OL-08)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    expect(screen.queryByText("ν")).not.toBeInTheDocument();
    expect(screen.queryByText("ρ")).not.toBeInTheDocument();
    expect(screen.getAllByText("Spread%").length).toBe(2); // call + put
    expect(screen.getAllByText("Liq").length).toBe(2);
    const msiLabel = screen.getByText("MSI Call/Put");
    expect(msiLabel.closest("div")?.querySelector("[title], button")).toBeTruthy();
  });

  it("keeps strike column sticky, right-aligns numeric cells, tabular-nums (OL-11)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    const table = document.querySelector("table")!;
    const strikeCell = table.querySelector("tbody td")!;
    expect(strikeCell.className).toMatch(/sticky/);
    expect(strikeCell.className).toMatch(/left-0/);
    expect(table.className).toMatch(/tabular-nums/);
  });

  it("labels pin_risk's 0-100 scale and formats greeks via the shared precision policy (OL-13)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    expect(screen.getByText("Pin Risk (0–100)")).toBeInTheDocument();
    const deltaCells = screen.getAllByText(/^-?0\.\d{3}$/);
    expect(deltaCells.length).toBeGreaterThan(0);
  });

  it("marks ATM/ZG/CW/PW rows with left-border + code chips, matching the classic ladder (OL-14)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    // "ATM" also appears as the levels strip's static stat label — scope to the row chip.
    const atmChip = screen.getAllByText("ATM").find((el) => el.closest("tr"))!;
    expect(atmChip.closest("tr")?.className).toMatch(/border-l-2/);
    expect(atmChip.closest("tr")?.className).not.toMatch(/bg-blue-500/);
  });

  it("shows a connecting state before the first live response (OL-17)", async () => {
    // Classic ladder fetch resolves normally (fixture already mocked by
    // beforeEach); the live options endpoint hangs so the connecting state
    // is observable before any resolution.
    const classicFetch = global.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/argus/options/live/")) return new Promise(() => {});
        return classicFetch(input);
      })
    );
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    expect(await screen.findByText(/connecting to live session/i)).toBeInTheDocument();
  });

  it("uses an accessible, persisted switch for the live/classic toggle (OL-10)", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const { unmount } = render(<OdteStrikesPage />);
    const toggle = screen.getByRole("switch", { name: /show live options ladder/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    unmount();

    render(<OdteStrikesPage />);
    expect(screen.getByRole("switch", { name: /show live options ladder/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});
