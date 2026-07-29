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
vi.mock("@/components/rails/MacroGauges", () => ({ MacroGauges: () => <div /> }));
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
  it("renders QUOTE FEED OFFLINE exactly once, not once per block", () => {
    window.innerWidth = 1600;
    render(<LeftRail />);
    expect(screen.getAllByText("QUOTE FEED OFFLINE")).toHaveLength(1);
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
