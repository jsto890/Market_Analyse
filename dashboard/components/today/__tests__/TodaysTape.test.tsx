import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { TapeBand } from "@/components/today/TodaysTape";
import type { MorningEvent } from "@/lib/report";

function event(overrides: Partial<MorningEvent>): MorningEvent {
  return {
    date: "2026-07-31",
    time_et: null,
    event: "CPI (Consumer Price Index)",
    category: "inflation",
    importance: "high",
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

/** The session track. Its labels are direct children, so one of them finds it. */
function axis(): HTMLElement {
  const el = screen.getByText(/^Regular ·/).parentElement;
  if (!el) throw new Error("no axis track");
  return el;
}

describe("TodaysTape — lane packing", () => {
  it("stacks two 08:30 releases instead of printing them on top of each other", () => {
    render(
      <TapeBand
        events={[
          event({ time_et: "08:30" }),
          event({ time_et: "08:30", event: "Initial jobless claims", category: "jobs" }),
        ]}
        nowMin={10 * 60}
      />
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
            ticker: "NVDA",
          }),
        ]}
        nowMin={10 * 60}
      />
    );
    expect(laneBox("NVDA earnings").style.bottom).toBe("0px");
    expect(laneBox("CPI").style.top).toBe("0px");
    expect(screen.getByRole("link", { name: /NVDA earnings/ })).toHaveAttribute("href", "/t/NVDA");
  });
});

describe("TodaysTape — events with no time", () => {
  it("keeps dated-only earnings off the axis rather than inventing a clock position", () => {
    render(
      <TapeBand
        events={[
          event({ event: "AAPL earnings", category: "earnings", ticker: "AAPL", time_et: null }),
        ]}
        nowMin={10 * 60}
      />
    );
    expect(screen.getByText("· no time on the feed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AAPL" })).toHaveAttribute("href", "/t/AAPL");
    // Nothing is positioned, so the axis carries nothing but the sessions.
    expect(screen.queryByText("AAPL earnings")).not.toBeInTheDocument();
  });

  it("says so plainly when nothing today has a time on it", () => {
    render(<TapeBand events={[]} nowMin={10 * 60} />);
    expect(screen.getByText(/No timed release today/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /What.s scheduled/ })).toHaveAttribute(
      "href",
      "/calendar"
    );
  });

  it("drops the axis entirely when nothing lands on it", () => {
    render(
      <TapeBand
        events={[event({ event: "AAPL earnings", category: "earnings", ticker: "AAPL" })]}
        nowMin={10 * 60}
      />
    );
    // Session bands are the context strip's job; an empty axis is furniture.
    expect(screen.queryByText(/Regular/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^now /)).not.toBeInTheDocument();
    expect(screen.queryByText("all times ET")).not.toBeInTheDocument();
    // The untimed row is the whole point of still rendering the panel.
    expect(screen.getByRole("link", { name: "AAPL" })).toBeInTheDocument();
  });

  it("brings the axis back the moment one event has a time", () => {
    render(
      <TapeBand
        events={[
          event({ event: "AAPL earnings", category: "earnings", ticker: "AAPL" }),
          event({ time_et: "08:30" }),
        ]}
        nowMin={10 * 60}
      />
    );
    expect(screen.getByText(/Regular/)).toBeInTheDocument();
  });
});

describe("TodaysTape — panel header", () => {
  it("carries the date stepper rather than leaving it orphaned below the card", () => {
    render(
      <TapeBand events={[]} nowMin={10 * 60} actions={<button type="button">Yesterday</button>} />
    );
    expect(screen.getByRole("button", { name: "Yesterday" })).toBeInTheDocument();
  });
});

describe("TodaysTape — now marker", () => {
  it("draws the marker while the tape is running", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60 + 15} />);
    // Labelled ET, because the page's other two clocks are local-time stamps.
    expect(screen.getByText("now 10:15 ET")).toBeInTheDocument();
  });

  it("drops it outside the drawn window, rather than pinning it to the edge", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={22 * 60} />);
    expect(screen.queryByText(/^now /)).not.toBeInTheDocument();
  });

  it("keeps the pill in a lane of its own, above the bar it cuts", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60 + 15} />);
    const pill = screen.getByText("now 10:15 ET");
    expect(pill.className).toContain("bg-accent");
    expect(pill.className).toContain("text-bg");
    // Between 09:30 and 10:00 the pill and the REGULAR label want the same row.
    expect(axis().contains(pill)).toBe(false);
    // The stripe still marks the position on the bar itself.
    expect(axis().querySelector("div.bg-accent")).not.toBeNull();
  });
});

describe("TodaysTape — session axis", () => {
  it("draws one 24px track with the regular session lifted between two edges", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60} />);
    const track = axis();
    expect(track.style.height).toBe("24px");
    // Recessed, not raised: the panel around it is already --elevated, so a
    // matching track would leave the pre/after wings invisible.
    expect(track.className).toContain("bg-surface");

    // 09:30–16:00 of an 04:00–20:00 axis, straight off TAPE_SESSIONS.
    const regular = track.querySelector("div.bg-raised") as HTMLElement;
    expect(regular.style.left).toBe("34.375%");
    expect(regular.style.width).toBe("40.625%");
    expect(regular.className).toContain("border-line-strong");
  });

  it("sets the session labels inside the track, regular brighter than the wings", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60} />);
    const pre = screen.getByText(/^Pre ·/);
    expect(pre.style.left).toBe("calc(0% + 8px)");
    expect(pre.className).toContain("text-muted-2");
    expect(screen.getByText(/^Regular ·/).className).toContain("text-muted");
    expect(screen.getByText(/^After ·/).style.left).toBe("calc(75% + 8px)");
  });
});

describe("TodaysTape — mark treatment", () => {
  it("gives earnings a chip and leaves releases as text", () => {
    render(
      <TapeBand
        events={[
          event({ time_et: "08:30" }),
          event({ time_et: "16:05", event: "NVDA earnings", category: "earnings", ticker: "NVDA" }),
        ]}
        nowMin={10 * 60}
      />
    );
    const chip = screen.getByText("NVDA earnings").parentElement as HTMLElement;
    expect(chip.className).toContain("border-warn/50");
    expect(chip.className).toContain("bg-warn/10");
    expect(chip.className).toContain("text-warn");
    // A release must not read as single-name event risk.
    expect(laneBox("CPI").innerHTML).not.toContain("bg-warn/10");
  });

  it("drops a connector from the axis to each release, and a tick where it lands", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60} />);
    const wrapper = laneBox("CPI");
    const connector = wrapper.querySelector("span.w-px") as HTMLElement;
    // Lane 0 sits 8px under the axis; the drop meets the label's centre line.
    expect(connector.style.top).toBe("-8px");
    expect(connector.style.height).toBe("19px");
    expect(connector.className).toContain("bg-warn/50"); // high importance
    expect(
      Array.from(wrapper.querySelectorAll("span")).some((s) => s.className.includes("w-[8px]"))
    ).toBe(true);
  });

  it("prints the clock and the name only — the feed carries no actual or consensus", () => {
    render(<TapeBand events={[event({ time_et: "08:30", importance: "medium" })]} nowMin={10 * 60} />);
    expect(laneBox("CPI").textContent).toBe("08:30CPI");
    const connector = laneBox("CPI").querySelector("span.w-px") as HTMLElement;
    expect(connector.className).toContain("bg-line-strong");
  });
});
