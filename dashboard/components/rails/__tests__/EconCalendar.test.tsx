// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { EconCalendar } from "@/components/rails/EconCalendar";
import * as calendarLib from "@/lib/calendar";

vi.mock("@/lib/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof calendarLib>();
  return { ...actual, useCalendar: vi.fn() };
});

function mkEvent(i: number, importance: string) {
  return { date: "2026-07-29", time_et: "08:30", event: `Event ${i}`, category: "econ", importance, source: "bls", ticker: null };
}

describe("EconCalendar (LR-09, A11Y-03, MAC-01, MAC-04)", () => {
  it("counts the overflow into the tail link (MAC-01)", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => mkEvent(i, "low")) },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const more = screen.getByText("+2 more ›");
    expect(more.closest("a")).toHaveAttribute("href", "/calendar");
  });

  it("puts the destination in the header, where the column label used to be (R-03)", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "low")] },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const header = screen.getByText("calendar ›");
    expect(header.closest("a")).toHaveAttribute("href", "/calendar");
    expect(header.className).toContain("text-accent");
    // "impact" labelled a column the rail never rendered.
    expect(screen.queryByText("impact")).toBeNull();
    // Nothing overflows, so the tail link would just repeat the header.
    expect(screen.queryByText(/more ›/)).toBeNull();
  });

  it("ranks importance with visible text, not a hover-only dot (MAC-04)", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "high"), mkEvent(2, "medium")] },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const high = screen.getByText("High importance").parentElement!;
    const medium = screen.getByText("Medium importance").parentElement!;
    expect(high.textContent).toContain("H");
    expect(medium.textContent).toContain("M");
    expect(high.className).not.toEqual(medium.className);
  });

  it("renders time_et on the numeric role with a token color, not a 9/10px opacity fade", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "low")] },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const time = screen.getByText("08:30");
    expect(time.className).toContain("text-data");
    expect(time.className).toContain("text-muted");
    expect(time.className).not.toContain("opacity-60");
  });

  it("gives the day and the time one slot, not two columns (R-03)", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: {
        today: "2026-07-29",
        days: 7,
        events: [
          { ...mkEvent(1, "high"), date: "2026-07-29", time_et: "09:45" },
          { ...mkEvent(2, "high"), date: "2026-07-31", time_et: "08:30" },
        ],
      },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);

    // Today is placed by the clock; the tint already says which day it is.
    const todayRow = screen.getByText("Event 1").parentElement!;
    expect(todayRow.textContent).toContain("09:45");
    expect(todayRow.textContent).not.toContain("Today");

    // A later release is placed by its day — 08:30 next Friday is not a rail fact.
    const laterRow = screen.getByText("Event 2").parentElement!;
    expect(laterRow.textContent).toContain("Fri");
    expect(laterRow.textContent).not.toContain("08:30");
  });
});
