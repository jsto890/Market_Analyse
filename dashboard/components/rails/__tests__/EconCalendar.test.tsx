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
  it("points the overflow link at /calendar, not the sentiment page (MAC-01)", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => mkEvent(i, "low")) },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const more = screen.getByText("+2 more · full calendar ›");
    expect(more.closest("a")).toHaveAttribute("href", "/calendar");
  });

  it("still offers the calendar link when nothing overflows", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "low")] },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    expect(screen.getByText("full calendar ›").closest("a")).toHaveAttribute("href", "/calendar");
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

  it("renders time_et at the 11px floor with a token color, not a 9/10px opacity fade", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "low")] },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const time = screen.getByText("08:30");
    expect(time.className).toContain("text-micro");
    expect(time.className).toContain("text-muted-2");
    expect(time.className).not.toContain("opacity-60");
          });
});
