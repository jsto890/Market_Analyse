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

describe("FxChip (LR-08)", () => {
  it("renders a single FX · <state> label in one tone, not per-state colors", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T13:00:00Z")); // Mon 13:00 UTC — LDN+NY overlap
    window.innerWidth = 1600;
    render(<LeftRail />);
    const chip = screen.getByText("FX · LDN·NY");
    expect(chip.className).toContain("bg-elevated");
    expect(chip.className).toContain("text-muted");
    expect(chip.className).not.toContain("bg-teal/15");
    expect(chip.className).not.toContain("text-teal");
    vi.useRealTimers();
  });
});
