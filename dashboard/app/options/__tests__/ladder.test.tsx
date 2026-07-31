import { vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@/test/render";
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

  it("counts density in strikes, so the row count is the same on every symbol", async () => {
    // A percent band is 76 strikes on SPY and 4 on a $20 name. The endpoint
    // only takes a percent, so the fetch stays wide and the slice is local —
    // which also means changing density must not refire the request.
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");

    const urls = () => vi.mocked(global.fetch).mock.calls.map((c) => String(c[0]));
    expect(urls().some((u) => u.includes("band=0.5"))).toBe(true);
    const before = urls().length;

    await user.click(screen.getByRole("radio", { name: "±10" }));
    await user.click(screen.getByRole("radio", { name: "All" }));

    expect(urls().length).toBe(before);
  });

  it("names the strike control and every one of its options", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    expect(screen.getByRole("radiogroup", { name: "Strikes" })).toBeInTheDocument();
    for (const label of ["±10", "±20", "±40", "All"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "±20" })).toHaveAttribute("aria-checked", "true");
  });

  it("reverses strike order on demand", async () => {
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");

    const strikeOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.querySelectorAll("td")[3]?.textContent?.replace(/\D/g, ""))
        .filter(Boolean);

    expect(strikeOrder()[0]).toBe("570");
    await user.click(screen.getByRole("button", { name: /strike high/i }));
    expect(strikeOrder()[0]).toBe("560");
  });

  it("jumps to the nearest listed strike", async () => {
    // Centring writes scrollTop on the ladder's own scroll box. It must not use
    // scrollIntoView, which scrolls every ancestor and takes the sticky column
    // header off the top of the page with it.
    const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "scrollTop");
    const boxes: Element[] = [];
    Object.defineProperty(window.HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get: () => 0,
      set(this: HTMLElement) {
        boxes.push(this);
      },
    });
    try {
      const user = userEvent.setup();
      render(<OptionsLadderPage />);
      await screen.findByText("call IV");
      await waitFor(() => expect(boxes.length).toBeGreaterThan(0));
      const afterMount = boxes.length;

      await user.type(screen.getByLabelText("Jump"), "566");
      await user.click(screen.getByRole("button", { name: "Go" }));

      expect(boxes.length).toBe(afterMount + 1);
      expect(boxes.every((el) => el.hasAttribute("data-ladder-scroll"))).toBe(true);
    } finally {
      if (original) Object.defineProperty(window.HTMLElement.prototype, "scrollTop", original);
    }
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

  it("labels the put and call side in every column header, not colour alone (OPT-10)", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    // The side used to live in a separate colgroup row, which scrolled out of
    // view horizontally. It is now in each column label, so it survives scroll.
    for (const label of ["put OI", "put vol", "put IV", "call IV", "call vol", "call OI"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("keeps the strike column pinned while the ladder scrolls sideways", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    const strikeHeader = screen.getByText("strike");
    expect(strikeHeader.className).toContain("sticky");
    expect(strikeHeader.className).toContain("left-0");
  });

  it("paints the sticky header on its cells so data rows cannot show through", async () => {
    render(<OptionsLadderPage />);
    await screen.findByText("call IV");
    // A border-collapse table will not paint a background on <thead>/<tr>.
    const table = screen.getByText("strike").closest("table")!;
    expect(table.className).toContain("border-separate");
    for (const label of ["put OI", "call IV", "call OI"]) {
      expect(screen.getByText(label).className).toContain("bg-surface");
    }
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

  it("states the side once as a spanning group and mirrors the columns (OPT-10)", async () => {
    // Prefixing the side onto all 12 columns is what made the header 23 columns
    // wide. It is stated once per side instead, and each side's columns run
    // outward from the strike so the two read as one profile.
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");

    const groups = screen.getAllByRole("columnheader").filter((th) => th.hasAttribute("colspan"));
    expect(groups.map((th) => th.textContent)).toEqual(["Calls", "Puts"]);
    expect(groups.every((th) => th.getAttribute("colspan") === "6")).toBe(true);

    const head = document.querySelector("thead")!;
    for (const label of ["bid", "ask", "vol", "OI", "IV", "GEX"]) {
      expect(within(head).getAllByText(label)).toHaveLength(2);
    }
  });

  it("opens at 13 columns, not 23, with greeks and quality off (OPT-04)", async () => {
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");
    expect(screen.getByText("13 columns")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Greeks/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Quality/ })).not.toBeChecked();
  });

  it("copies a strike from the live ladder too, not only the snapshot (OPT-06)", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");

    fireEvent.click(screen.getByRole("row", { name: "Copy strike 570" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/570.*call.*put.*GEX/));
  });

  it("marks the MSI strikes on the ladder, not just in a summary chip", async () => {
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");
    // Also named in the legend above the table, so scope the assertion to the
    // ladder body itself.
    const table = document.querySelector("table")!;
    expect(within(table).getByText("MSI-C")).toBeInTheDocument();
    expect(within(table).getByText("MSI-P")).toBeInTheDocument();
  });

  it("formats GEX with the same scale as everywhere else (OPT-11)", async () => {
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");
    expect(screen.getByText("+3M")).toBeInTheDocument();
    expect(screen.getByText("−2M")).toBeInTheDocument();
  });

  it("exposes vega and rho as toggleable columns behind the greeks group (OPT-05)", async () => {
    const user = userEvent.setup();
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");

    const vegaHeaders = () => screen.queryAllByText("ν").map((el) => el.closest("th")).filter(Boolean);
    expect(vegaHeaders()).toHaveLength(0);

    // Greeks are a group now: turning the group on brings its own per-greek
    // toggles with it, so vega takes two clicks rather than being always-on.
    await user.click(screen.getByRole("checkbox", { name: /Greeks/ }));
    await user.click(screen.getByRole("checkbox", { name: /vega/i }));
    expect(vegaHeaders()).toHaveLength(2);
  });

  it("groups the levels strip by what each number answers (OPT-12, OPT-13)", async () => {
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");
    for (const group of ["Pin", "Dealer gamma", "Crowd", "Data"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it("gives every levels tooltip a real accessible name, not an sr-only child (OPT-14)", async () => {
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");
    expect(screen.getByRole("button", { name: /what max pain means/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /what fresh means/i })).toBeInTheDocument();
  });

  it("keeps the mutating table out of the live region and announces mode in a status", async () => {
    render(<OptionsLadderPage />);
    await screen.findAllByText("bid");
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
