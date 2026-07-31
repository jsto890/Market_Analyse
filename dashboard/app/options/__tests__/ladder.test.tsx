import { vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage, seedLocalStorage } from "@/test/localStorage";
import userEvent from "@testing-library/user-event";
import { STATIC_KEYS } from "@/lib/storageKeys";
import OptionsLadderPage from "@/app/options/ladder/page";

function liveQuote(over: Record<string, unknown> = {}) {
  return {
    bid: 1, ask: 1.1, mid: 1.05, spread_pct: 5, iv: 0.2, delta: 0.5, gamma: 0.01,
    theta: -0.05, vega: 0.2, rho: 0.1, per_dollar_gamma: null, per_dollar_delta: null,
    volume: 100, oi: 1000, stale_ms: 0, liquid: true, ...over,
  };
}

function classicRow(strike: number) {
  return {
    strike,
    call: { oi: 100, vol: 50, last: 1, iv: 0.2 },
    put: { oi: 90, vol: 40, last: 1, iv: 0.21 },
    gex: strike > 565 ? 1_200_000 : -800_000,
  };
}

const LADDER = {
  symbol: "SPY",
  snap_date: "2026-07-31",
  spot: 565,
  levels: { zero_gamma: 560, call_wall: 570, put_wall: 555, total_gex: 1_000_000 },
  expiries: [
    {
      expiry: "0DTE",
      expected_move_pct: 0.8,
      rows: [classicRow(560), classicRow(565), classicRow(570)],
    },
  ],
};

const LIVE = {
  symbol: "SPY",
  spot: 565,
  as_of: "2026-07-31T12:00:00.000Z",
  source: "LIVE",
  stale_ms: 0,
  fresh_contract_ratio: 1,
  expiry: "0DTE",
  levels: [
    {
      strike: 565,
      call: liveQuote(),
      put: liveQuote({ delta: -0.5 }),
      zero_gamma_side: null,
      wall_type: null,
      gex_by_strike: 5000,
      call_gex_by_strike: 3_200_000,
      put_gex_by_strike: -1_800_000,
      max_pain_delta: 0,
    },
    {
      strike: 570,
      call: liveQuote({ delta: 0.25 }),
      put: liveQuote({ delta: -0.75 }),
      zero_gamma_side: null,
      wall_type: null,
      gex_by_strike: 100,
      call_gex_by_strike: 900_000,
      put_gex_by_strike: -100_000,
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
  msi_put_strike: 565,
  msi_rationale: "heaviest combined concentration",
  gex_profile_json: null,
};

function mockAll() {
  mockFetchJson((url: string) => {
    if (url.startsWith("/api/argus/ladder/SPY")) return LADDER;
    if (url.startsWith("/api/argus/options/live/SPY")) return LIVE;
    return {};
  });
}

describe("OptionsLadderPage — controls (OPT-01, OPT-05)", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockAll();
  });

  it("refetches at the chosen density instead of a hard-coded ±6% band", async () => {
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");

    await user.click(screen.getByRole("button", { name: "Tight" }));

    await waitFor(() => {
      const urls = vi.mocked(global.fetch).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("band=0.03"))).toBe(true);
    });
  });

  it("keeps every density option reachable and marks the active one", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    for (const label of ["Tight", "Normal", "Wide", "All"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reverses strike order on demand", async () => {
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");

    const strikeOrder = () =>
      screen
        .getAllByRole("row")
        .slice(2)
        .map((r) => r.querySelectorAll("td")[3]?.textContent?.replace(/\D/g, ""))
        .filter(Boolean);

    expect(strikeOrder()[0]).toBe("570");
    await user.click(screen.getByRole("button", { name: /strike high/i }));
    expect(strikeOrder()[0]).toBe("560");
  });

  it("jumps to the nearest listed strike", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    const afterMount = scrollIntoView.mock.calls.length;

    await user.type(screen.getByLabelText("Jump"), "566");
    await user.click(screen.getByRole("button", { name: "Go" }));

    expect(scrollIntoView.mock.calls.length).toBe(afterMount + 1);
  });

  it("still offers Center on spot, in both modes", async () => {
    render(<OptionsLadderPage />);
    expect(await screen.findByRole("button", { name: /center on spot/i })).toBeInTheDocument();
  });
});

describe("OptionsLadderPage — classic ladder", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockAll();
  });

  it("labels the put and call column blocks in text, not colour alone (OPT-10)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    expect(screen.getByText("Puts")).toBeInTheDocument();
    expect(screen.getByText("Calls")).toBeInTheDocument();
  });

  it("advertises click-to-copy before you click (OPT-06)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    expect(screen.getByText(/click any row to copy/i)).toBeInTheDocument();
  });

  it("copies strike, both IVs and GEX on click", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");

    fireEvent.click(screen.getAllByRole("row")[2]);

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/call IV.*put IV.*GEX/));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("puts the how-to-read reference below the ladder, collapsed (OPT-08)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");

    const trigger = screen.getByRole("button", { name: /how to read this ladder/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    const all = Array.from(document.body.querySelectorAll("*"));
    expect(all.indexOf(trigger)).toBeGreaterThan(all.indexOf(document.querySelector("table")!));
  });

  it("links out to the full reference tab", async () => {
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    await user.click(screen.getByRole("button", { name: /how to read this ladder/i }));
    expect(screen.getByRole("link", { name: /full reference/i })).toHaveAttribute(
      "href",
      "/options/learn"
    );
  });
});

describe("OptionsLadderPage — live ladder", () => {
  beforeEach(() => {
    resetLocalStorage();
    seedLocalStorage(STATIC_KEYS.odteLiveMode, true);
    mockAll();
  });

  it("groups the call and put blocks under headed spans (OPT-10)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("C Bid");
    const calls = screen.getByText("Calls");
    expect(calls.tagName).toBe("TH");
    expect(calls.getAttribute("colspan")).toBe(screen.getByText("Puts").getAttribute("colspan"));
  });

  it("marks the MSI strikes on the ladder, not just in a summary chip", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("C Bid");
    expect(screen.getByText("MSI-C")).toBeInTheDocument();
    expect(screen.getByText("MSI-P")).toBeInTheDocument();
  });

  it("formats GEX with the same scale as everywhere else (OPT-11)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("C Bid");
    expect(screen.getByText("+3M")).toBeInTheDocument();
    expect(screen.getByText("−2M")).toBeInTheDocument();
  });

  it("exposes vega and rho as toggleable columns (OPT-05)", async () => {
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findByText("C Bid");

    const vegaHeaders = () =>
      screen.queryAllByText("ν").filter((el) => el.tagName === "TH");
    expect(vegaHeaders()).toHaveLength(0);
    await user.click(screen.getByRole("checkbox", { name: /vega/i }));
    expect(vegaHeaders()).toHaveLength(2);
  });

  it("groups the levels strip by what each number answers (OPT-12, OPT-13)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("C Bid");
    for (const group of ["Pin", "Dealer gamma", "Crowd", "Data"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it("gives every levels tooltip a real accessible name, not an sr-only child (OPT-14)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("C Bid");
    expect(screen.getByRole("button", { name: /what max pain means/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /what fresh means/i })).toBeInTheDocument();
  });

  it("keeps the mutating table out of the live region and announces mode in a status", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("C Bid");
    const table = document.querySelector("table")!;
    expect(table.closest("[aria-live]")?.getAttribute("aria-live")).toBe("off");
    expect(screen.getAllByRole("status").some((s) => /live ladder on/i.test(s.textContent ?? ""))).toBe(
      true
    );
  });

  it("ranks the most valuable contracts from the live greeks", async () => {
    render(<OptionsLadderPage />);
    expect(await screen.findByText("Most valuable contracts")).toBeInTheDocument();
  });

  it("reports how many strikes the density band is hiding", async () => {
    render(<OptionsLadderPage />);
    expect(await screen.findByText(/2 of 2 strikes shown/)).toBeInTheDocument();
  });
});
