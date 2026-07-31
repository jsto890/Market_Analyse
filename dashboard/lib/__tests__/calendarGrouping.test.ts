import { describe, it, expect } from "vitest";
import {
  earningsSession,
  etInstant,
  fullDayLabel,
  groupBySpine,
  groupByWeek,
  isEarnings,
  localTimeLabel,
  weekLabel,
  weekStart,
  type CalEvent,
} from "@/lib/calendar";
import { eventMeta, eventShortName } from "@/lib/eventMeta";

function ev(date: string, over: Partial<CalEvent> = {}): CalEvent {
  return {
    date, time_et: "08:30", event: "CPI", category: "inflation",
    importance: "high", source: "bls", ticker: null, ...over,
  };
}

describe("calendar week spine", () => {
  it("snaps every weekday to the Monday of its ISO week", () => {
    expect(weekStart("2026-07-31")).toBe("2026-07-27"); // Friday -> Monday
    expect(weekStart("2026-07-27")).toBe("2026-07-27"); // Monday -> itself
    expect(weekStart("2026-08-02")).toBe("2026-07-27"); // Sunday -> same week
  });

  it("labels relative weeks, then falls back to a date", () => {
    expect(weekLabel("2026-07-27", "2026-07-31")).toBe("This week");
    expect(weekLabel("2026-08-03", "2026-07-31")).toBe("Next week");
    expect(weekLabel("2026-08-17", "2026-07-31")).toMatch(/^Week of /);
  });

  it("buckets chronologically and drops empty weeks", () => {
    const weeks = groupByWeek(
      [ev("2026-08-17"), ev("2026-07-31"), ev("2026-08-03")],
      "2026-07-31"
    );
    expect(weeks.map((w) => w.label)).toEqual(["This week", "Next week", "Week of 17 Aug"]);
    expect(weeks[0].events).toHaveLength(1);
  });

  it("names the day in full for the day header", () => {
    expect(fullDayLabel("2026-07-31")).toMatch(/^Friday\b.*31 Jul$/);
  });

  it("collapses everything past next week into one bucket", () => {
    const spine = groupBySpine(
      [ev("2026-07-31"), ev("2026-08-03"), ev("2026-08-17"), ev("2026-08-24")],
      "2026-07-31"
    );
    expect(spine.map((w) => w.label)).toEqual(["This week", "Next week", "Later"]);
    expect(spine[2].events).toHaveLength(2);
  });

  it("only says 'this month' when the tail really is in this month", () => {
    const sameMonth = groupBySpine([ev("2026-07-31"), ev("2026-08-17")], "2026-08-01");
    expect(sameMonth.map((w) => w.label)).toEqual(["This week", "Later this month"]);
  });

  it("leaves the spine alone when nothing runs past next week", () => {
    const spine = groupBySpine([ev("2026-07-31"), ev("2026-08-03")], "2026-07-31");
    expect(spine.map((w) => w.label)).toEqual(["This week", "Next week"]);
  });
});

describe("earnings session", () => {
  it("splits the tape at the open and the close", () => {
    expect(earningsSession("07:00")).toBe("BMO");
    expect(earningsSession("09:29")).toBe("BMO");
    expect(earningsSession("12:00")).toBe("intraday");
    expect(earningsSession("16:00")).toBe("AMC");
    expect(earningsSession("16:30")).toBe("AMC");
  });

  it("returns null rather than guessing a session the feed never sent", () => {
    // Every earnings row from the Argus seed carries a date and no time.
    expect(earningsSession(null)).toBeNull();
    expect(earningsSession("TBA")).toBeNull();
  });
});

describe("release times", () => {
  it("resolves an 08:30 ET release to the right UTC instant across DST", () => {
    expect(etInstant("2026-07-31", "08:30")!.toISOString()).toBe("2026-07-31T12:30:00.000Z"); // EDT, UTC-4
    expect(etInstant("2026-01-13", "08:30")!.toISOString()).toBe("2026-01-13T13:30:00.000Z"); // EST, UTC-5
  });

  it("returns null rather than a fake time when the ET time is unknown", () => {
    expect(localTimeLabel("2026-07-31", null)).toBeNull();
  });

  it("renders a local time string for a known release", () => {
    expect(localTimeLabel("2026-07-31", "08:30")).toMatch(/^\d{2}:\d{2}/);
  });
});

describe("event classification and meaning", () => {
  it("treats ticker-bearing and earnings-category rows as earnings", () => {
    expect(isEarnings(ev("2026-07-31", { category: "earnings", ticker: "AAPL" }))).toBe(true);
    expect(isEarnings(ev("2026-07-31", { ticker: "MSFT" }))).toBe(true);
    expect(isEarnings(ev("2026-07-31"))).toBe(false);
  });

  it("explains every seeded macro release", () => {
    const seeded = [
      "FOMC rate decision",
      "CPI (Consumer Price Index)",
      "Employment Situation (Nonfarm Payrolls)",
      "Initial jobless claims",
      "PPI (Producer Price Index)",
      "GDP (advance estimate)",
      "Personal Income & Outlays (PCE)",
    ];
    for (const name of seeded) {
      const meta = eventMeta(name, null, null);
      expect(meta, name).not.toBeNull();
      expect(meta!.beat.length).toBeGreaterThan(20);
      expect(meta!.miss.length).toBeGreaterThan(20);
    }
  });

  it("gives earnings rows a per-ticker meaning entry", () => {
    const meta = eventMeta("AAPL earnings", "earnings", "AAPL")!;
    expect(meta.tickers).toEqual(["AAPL"]);
    expect(meta.whyNow).toMatch(/volatility/i);
  });

  it("falls back to the raw event name when nothing matches", () => {
    expect(eventShortName("Some unlisted release", null, null)).toBe("Some unlisted release");
    expect(eventShortName("CPI (Consumer Price Index)", null, null)).toBe("CPI");
  });
});
