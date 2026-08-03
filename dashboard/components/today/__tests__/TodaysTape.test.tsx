import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { TapeBand } from "@/components/today/TodaysTape";
import type { CalEvent } from "@/lib/calendar";

/** 12:00Z on Mon 3 Aug 2026 — 08:00 in New York, 22:00 in Sydney. The window
 *  the tape draws from it runs 10:00Z Mon → 10:00Z Tue. */
const AT = new Date("2026-08-03T12:00:00Z");

function event(overrides: Partial<CalEvent>): CalEvent {
  return {
    date: "2026-08-03",
    time_et: null,
    event: "CPI (Consumer Price Index)",
    category: "inflation",
    importance: "high",
    source: "seed",
    ticker: null,
    ...overrides,
  };
}

/** The wrapper that actually carries the lane offset. */
function laneBox(label: string): HTMLElement {
  const el = screen.getByText(label).closest("div.absolute");
  if (!el) throw new Error(`no positioned wrapper for ${label}`);
  return el as HTMLElement;
}

/** The session track. The labels are direct children, so one of them finds it. */
function axis(): HTMLElement {
  const el = screen.getByText(/^Regular ·/).parentElement;
  if (!el) throw new Error("no axis track");
  return el;
}

/** The tape's `+1` rides in its own span, so a reading is split across two nodes
 *  and RTL's string matcher never sees it whole. Match the innermost element
 *  that holds the entire reading instead. */
function readingByText(text: string) {
  return screen.getByText(
    (_, el) =>
      el?.textContent === text &&
      !Array.from(el.children).some((c) => c.textContent === text),
  );
}

describe("TodaysTape — the rolling window", () => {
  it("draws the axis on a day with nothing scheduled at all", () => {
    render(<TapeBand events={[]} at={AT} />);
    // The old build hid the whole band when nothing landed on it, and the panel
    // read as broken rather than quiet.
    expect(axis()).toBeInTheDocument();
    expect(screen.getByText(/^Pre ·/)).toBeInTheDocument();
    expect(readingByText("now 22:00")).toBeInTheDocument();
    expect(screen.getByText(/Nothing scheduled inside this window/)).toBeInTheDocument();
  });

  it("opens two hours behind now, so a just-missed print is still on screen", () => {
    // 11:00Z is an hour before `at` — off the left edge of a window that started
    // at now, on the axis in one that looks back.
    render(<TapeBand events={[event({ time_et: "07:00" })]} at={AT} />);
    // One hour into the window, an hour behind the now-marker at two.
    expect(laneBox("CPI").style.left).toBe(`${(1 / 24) * 100}%`);
    expect(readingByText("now 22:00").style.left).toBe(`${(2 / 24) * 100}%`);
  });

  it("advances with the clock rather than sitting on a fixed axis", () => {
    const { unmount } = render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    const before = laneBox("CPI").style.left;
    unmount();
    // An hour later the same release has slid an hour's worth of axis left.
    render(
      <TapeBand
        events={[event({ time_et: "08:30" })]}
        at={new Date("2026-08-03T13:00:00Z")}
      />,
    );
    const after = laneBox("CPI").style.left;
    expect(parseFloat(after)).toBeCloseTo(parseFloat(before) - (1 / 24) * 100, 6);
  });

  it("drops an event outside the window instead of pinning it to an edge", () => {
    render(
      <TapeBand
        events={[
          event({ time_et: "08:30" }),
          // 08:30 ET Wednesday is two days out — past the right edge.
          event({ date: "2026-08-05", time_et: "08:30", event: "PPI", category: "inflation" }),
        ]}
        at={AT}
      />,
    );
    expect(screen.getByText("CPI")).toBeInTheDocument();
    expect(screen.queryByText("PPI")).not.toBeInTheDocument();
  });
});

describe("TodaysTape — the Sydney clock", () => {
  it("prints release times on the Sydney clock, not the New York one", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    expect(laneBox("CPI").textContent).toBe("22:30 · CPI");
  });

  it("marks the readings that have rolled past midnight here", () => {
    render(
      <TapeBand
        events={[
          event({
            time_et: "16:05",
            event: "NVDA earnings",
            category: "earnings",
            source: "earnings",
            ticker: "NVDA",
          }),
        ]}
        at={AT}
      />,
    );
    expect(readingByText("06:05 +1")).toBeInTheDocument();
  });

  it("says whose clock it is printing", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    expect(screen.getByText("24h window · all times Sydney")).toBeInTheDocument();
    expect(screen.getByText(/^Regular ·/).textContent).toBe("Regular · 23:30");
  });
});

describe("TodaysTape — the hour ruler", () => {
  it("scales a window that would otherwise carry no clock at all", () => {
    render(<TapeBand events={[]} at={AT} />);
    // 12:00Z is the first four-hourly mark inside the window; 22:00 in Sydney.
    expect(readingByText("22:00")).toBeInTheDocument();
    expect(readingByText("02:00 +1")).toBeInTheDocument();
    expect(readingByText("18:00 +1")).toBeInTheDocument();
  });
});

describe("TodaysTape — lanes", () => {
  it("stacks two 08:30 releases instead of printing them on top of each other", () => {
    render(
      <TapeBand
        events={[
          event({ time_et: "08:30" }),
          event({ time_et: "08:30", event: "Initial jobless claims", category: "jobs" }),
        ]}
        at={AT}
      />,
    );
    // Same clock position, so the only thing separating them is the lane.
    expect(laneBox("CPI").style.left).toBe(laneBox("Jobless claims").style.left);
    expect(laneBox("CPI").style.top).not.toBe(laneBox("Jobless claims").style.top);
  });

  it("puts earnings above the line and releases below it", () => {
    render(
      <TapeBand
        events={[
          event({ time_et: "08:30" }),
          event({
            time_et: "16:05",
            event: "NVDA earnings",
            category: "earnings",
            source: "earnings",
            ticker: "NVDA",
          }),
        ]}
        at={AT}
      />,
    );
    expect(laneBox("NVDA earnings").style.bottom).toBe("0px");
    expect(laneBox("CPI").style.top).toBe("0px");
    expect(screen.getByRole("link", { name: /NVDA earnings/ })).toHaveAttribute("href", "/t/NVDA");
  });
});

describe("TodaysTape — events with no time", () => {
  it("keeps a date-only name off the axis rather than inventing a clock position", () => {
    render(
      <TapeBand
        events={[
          event({
            event: "AAPL earnings",
            category: "earnings",
            source: "earnings",
            ticker: "AAPL",
            time_et: null,
          }),
        ]}
        at={AT}
      />,
    );
    expect(screen.getByText("· no time on the feed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AAPL" })).toHaveAttribute("href", "/t/AAPL");
    expect(screen.queryByText("AAPL earnings")).not.toBeInTheDocument();
  });

  it("leaves an untimed row dated outside the window to the calendar page", () => {
    render(
      <TapeBand
        events={[
          event({
            date: "2026-08-07",
            event: "MSFT earnings",
            category: "earnings",
            source: "earnings",
            ticker: "MSFT",
          }),
        ]}
        at={AT}
      />,
    );
    expect(screen.queryByText("· no time on the feed")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing scheduled inside this window/)).toBeInTheDocument();
  });
});

describe("TodaysTape — the now marker", () => {
  it("is always on the axis, because the window is built around it", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    // Two hours into a 24-hour window.
    expect(readingByText("now 22:00").style.left).toBe(`${(2 / 24) * 100}%`);
  });

  it("keeps the pill in a lane of its own, above the bar it cuts", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    const pill = readingByText("now 22:00");
    expect(pill.className).toContain("bg-accent");
    expect(pill.className).toContain("text-bg");
    // A pill on the axis row collides with whichever session label wants it.
    expect(axis().contains(pill)).toBe(false);
    // The stripe still marks the position on the bar itself.
    expect(axis().querySelector("div.bg-accent")).not.toBeNull();
  });
});

describe("TodaysTape — the session axis", () => {
  it("draws one 24px track with the regular session lifted between two edges", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    const track = axis();
    expect(track.style.height).toBe("24px");
    // Recessed, not raised: the panel around it is already --elevated, so a
    // matching track would leave the pre/after wings invisible.
    expect(track.className).toContain("bg-surface");

    // 09:30–16:00 ET Monday, 3.5h and 6.5h into a window that opened at 06:00 ET.
    const regular = track.querySelector("div.bg-raised") as HTMLElement;
    expect(parseFloat(regular.style.left)).toBeCloseTo((3.5 / 24) * 100, 6);
    expect(parseFloat(regular.style.width)).toBeCloseTo((6.5 / 24) * 100, 6);
    expect(regular.className).toContain("border-line-strong");
  });

  it("clips the session the window opened inside instead of starting it early", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    // Monday's Pre began at 04:00 ET, two hours before this window.
    const pre = screen.getByText(/^Pre ·/);
    expect(pre.style.left).toBe("calc(0% + 8px)");
    expect(pre.textContent).toBe("Pre · 20:00");
    expect(pre.className).toContain("text-muted-2");
    expect(screen.getByText(/^Regular ·/).className).toContain("text-muted");
  });

  it("leaves a sliver of a session unlabelled rather than printing off the edge", () => {
    render(<TapeBand events={[]} at={AT} />);
    // Tuesday's Pre opens 22 hours in — two hours of track, nowhere near enough
    // for "Pre · 18:00" — while Monday's three sessions all keep their labels.
    expect(screen.getAllByText(/^(Pre|Regular|After) ·/)).toHaveLength(3);
    // Four bands are still drawn — the `:not` drops the now-stripe, which shares
    // the band's positioning classes.
    expect(axis().querySelectorAll("div.inset-y-0:not(.bg-accent)")).toHaveLength(4);
  });
});

describe("TodaysTape — mark styling", () => {
  it("chips earnings amber and leaves releases as plain text", () => {
    render(
      <TapeBand
        events={[
          event({ time_et: "08:30" }),
          event({
            time_et: "16:05",
            event: "NVDA earnings",
            category: "earnings",
            source: "earnings",
            ticker: "NVDA",
          }),
        ]}
        at={AT}
      />,
    );
    const chip = screen.getByText("NVDA earnings").closest("a") as HTMLElement;
    expect(chip.className).toContain("border-warn/50");
    expect(chip.className).toContain("bg-warn/10");
    expect(chip.className).toContain("text-warn");
    // Single-name risk should not look like a scheduled macro print.
    expect(laneBox("CPI").innerHTML).not.toContain("bg-warn/10");
  });

  it("connects a high-importance release to the axis with an amber rule", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    const wrapper = laneBox("CPI");
    const connector = wrapper.querySelector("span.w-px") as HTMLElement;
    expect(connector.style.top).toBe("-8px");
    expect(connector.style.height).toBe("19px");
    expect(connector.className).toContain("bg-warn/50");
    expect(
      Array.from(wrapper.querySelectorAll("span")).some((s) =>
        s.className.includes("w-[8px]"),
      ),
    ).toBe(true);
  });

  it("prints time and name only — the feed carries no actual or consensus", () => {
    render(<TapeBand events={[event({ time_et: "08:30", importance: "medium" })]} at={AT} />);
    expect(laneBox("CPI").textContent).toBe("22:30 · CPI");
    const connector = laneBox("CPI").querySelector("span.w-px") as HTMLElement;
    expect(connector.className).toContain("bg-line-strong");
  });
});

describe("TodaysTape — no date stepper", () => {
  it("offers no way to walk back a day", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} at={AT} />);
    expect(screen.queryByRole("button", { name: /yesterday|previous|←/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /yesterday|previous|←/i })).not.toBeInTheDocument();
  });
});
