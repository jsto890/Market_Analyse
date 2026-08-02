import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import { LeftRail } from "@/components/rails/LeftRail";

vi.mock("@/lib/rail-quotes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rail-quotes")>();
  return {
    ...actual,
    useRailQuotes: () => ({ data: undefined, error: new Error("500"), updatedAt: null }),
  };
});
vi.mock("@/components/rails/EconCalendar", () => ({ EconCalendar: () => <div /> }));
vi.mock("@/components/rails/MacroGauges", () => ({
  MacroGauges: () => <div data-testid="rail-macro" />,
}));
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/lib/macro", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/macro")>();
  return {
    ...actual,
    useMacro: () => ({ data: { gauges: [{ scope: "global", window: "1d", score: 0.12, n: 40, ts: "" }] } }),
  };
});
vi.mock("@/lib/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calendar")>();
  return {
    ...actual,
    useCalendar: () => ({
      data: {
        today: "2026-07-28",
        days: 1,
        events: [{ date: "2026-07-28", time_et: "08:30", event: "CPI", category: "econ", importance: "high", source: "s", ticker: null }],
      },
    }),
  };
});

beforeEach(() => {
  resetLocalStorage();
  pathname = "/";
});

describe("LeftRail width-based collapse (LR-01)", () => {
  it("self-collapses below 1280px viewport width, with no stored preference", () => {
    window.innerWidth = 1000;
    render(<LeftRail />);
    expect(screen.getByLabelText("Expand quote rail")).toBeInTheDocument();
  });

  it("stays expanded at 1280px and above", () => {
    window.innerWidth = 1600;
    render(<LeftRail />);
    expect(screen.getByLabelText("Collapse quote rail")).toBeInTheDocument();
  });
});

describe("LeftRail offline banner (LR-02)", () => {
  it("renders the quote-feed failure exactly once, not once per block", () => {
    window.innerWidth = 1600;
    render(<LeftRail />);
    expect(screen.getAllByText("Quote feed offline")).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("LeftRail collapsed-strip (LR-04)", () => {
  it("shows a glyph for each hidden block (FX, calendar, macro)", () => {
    window.innerWidth = 1000;
    render(<LeftRail />);
    expect(screen.getByLabelText(/^FX:/)).toBeInTheDocument();
    expect(screen.getByLabelText("Next: CPI")).toBeInTheDocument();
    expect(screen.getByLabelText("Macro: +0.12")).toBeInTheDocument();
  });
});

describe("LeftRail sticky footer (LR-05)", () => {
  it("keeps MacroGauges + the collapse control outside the scrolling content area", () => {
    window.innerWidth = 1600;
    render(<LeftRail />);
    const collapseBtn = screen.getByLabelText("Collapse quote rail");
    expect(collapseBtn.closest(".overflow-y-auto")).toBeNull();
  });
});

describe("LeftRail block separation (LR-06)", () => {
  it("uses the stronger line-strong border between quote-group blocks, not the standard 1px line", () => {
    window.innerWidth = 1600;
    render(<LeftRail />);
    // Two Block instances use separator: "US Equity" and "Forex".
    expect(document.querySelectorAll(".border-line-strong").length).toBeGreaterThanOrEqual(2);
  });
});

describe("LeftRail macro suppression on /macro", () => {
  it("drops the gauge block when the macro page is already showing the same scores", () => {
    window.innerWidth = 1600;
    pathname = "/macro";
    render(<LeftRail />);
    expect(screen.queryByTestId("rail-macro")).not.toBeInTheDocument();
    // The quote blocks are not duplicated by /macro, so they stay.
    expect(screen.getByText("Futures")).toBeInTheDocument();
  });

  it("drops the collapsed strip's macro dot too — a 6px restatement is still a restatement", () => {
    window.innerWidth = 1000;
    pathname = "/macro";
    render(<LeftRail />);
    expect(screen.queryByLabelText(/^Macro:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Next: CPI")).toBeInTheDocument();
    expect(screen.getByLabelText(/^FX:/)).toBeInTheDocument();
  });

  it("keeps both everywhere else — off /macro the rail is the only macro reading", () => {
    window.innerWidth = 1600;
    pathname = "/watchlist";
    render(<LeftRail />);
    expect(screen.getByTestId("rail-macro")).toBeInTheDocument();
  });
});

describe("EquityBadge session tone (R-01)", () => {
  const renderAt = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    window.innerWidth = 1600;
    render(<LeftRail />);
  };

  it("is green while the bell is open — open is a state, and accent is interactive-only", () => {
    renderAt("2026-07-28T14:00:00Z"); // Mon 10:00 ET
    const badge = screen.getByText("REG");
    expect(badge.className).toContain("text-pos");
    expect(badge.className).not.toContain("accent");
    vi.useRealTimers();
  });

  it("goes muted either side of the bell", () => {
    renderAt("2026-07-28T12:00:00Z"); // Mon 08:00 ET — pre
    const badge = screen.getByText("PRE");
    expect(badge.className).toContain("text-muted");
    expect(badge.className).not.toContain("accent");
    vi.useRealTimers();
  });

  it("goes amber when the market is shut", () => {
    renderAt("2026-08-01T14:00:00Z"); // Sat — equity and FX both read CLOSED
    const shut = screen.getAllByText("CLOSED");
    expect(shut).toHaveLength(2);
    shut.forEach((el) => expect(el.className).toContain("text-warn"));
    vi.useRealTimers();
  });
});

describe("FxChip (R-02)", () => {
  it("drops the FX prefix and goes teal on a session overlap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T13:00:00Z")); // Mon 13:00 UTC — LDN+NY overlap
    window.innerWidth = 1600;
    render(<LeftRail />);
    expect(screen.queryByText(/^FX ·/)).not.toBeInTheDocument();
    const chip = screen.getByText("LDN/NY");
    expect(chip.className).toContain("text-teal");
    vi.useRealTimers();
  });

  it("stays muted while only one session is open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T10:00:00Z")); // Mon 10:00 UTC — LDN only
    window.innerWidth = 1600;
    render(<LeftRail />);
    const chip = screen.getByText("LDN");
    expect(chip.className).toContain("text-muted");
    expect(chip.className).not.toContain("text-teal");
    vi.useRealTimers();
  });

  it("goes amber over the weekend", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T13:00:00Z")); // Sat
    window.innerWidth = 1600;
    render(<LeftRail />);
    screen
      .getAllByText("CLOSED")
      .forEach((el) => expect(el.className).toContain("text-warn"));
    vi.useRealTimers();
  });
});
