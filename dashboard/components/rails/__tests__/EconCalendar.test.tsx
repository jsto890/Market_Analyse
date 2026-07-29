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

describe("EconCalendar (LR-09, A11Y-03)", () => {
  it("shows a +N more link to /macro when events exceed max", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => mkEvent(i, "low")) },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const more = screen.getByText("+2 more ›");
    expect(more.closest("a")).toHaveAttribute("href", "/macro");
  });

  it("gives the importance dot a discoverable label and a shape difference, not color-only", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "high"), mkEvent(2, "medium")] },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const high = screen.getByLabelText("High importance");
    const medium = screen.getByLabelText("Medium importance");
    expect(high.className).toContain("rounded-sm");
    expect(medium.className).toContain("rounded-full");
  });
});
