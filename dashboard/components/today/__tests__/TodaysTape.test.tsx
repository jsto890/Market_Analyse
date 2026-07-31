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
});
