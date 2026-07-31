import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import EventRow from "@/components/calendar/EventRow";
import type { CalEvent } from "@/lib/calendar";

function ev(over: Partial<CalEvent> = {}): CalEvent {
  return {
    date: "2026-08-06", time_et: null, event: "NVDA earnings", ticker: "NVDA",
    category: "earnings", importance: "high", source: "earnings",
    ...over,
  } as CalEvent;
}

async function expand(name: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name }));
}

describe("EventRow — event to names to positions", () => {
  it("closes the loop from an earnings date to the position you hold in it", async () => {
    render(<EventRow ev={ev()} isWatchlist={false} held={new Map([["NVDA", 150]])} />);
    await expand(/NVDA/);
    expect(screen.getByRole("link", { name: "$NVDA" })).toHaveAttribute("href", "/t/NVDA");
    const position = screen.getByRole("link", { name: "NVDA +150" });
    expect(position).toHaveAttribute("href", "/portfolio");
    // The chip beside it already says NVDA; repeating it would be the same word
    // twice on one line.
    expect(position.textContent).toBe("+150");
  });

  it("carries a macro release through to the index exposure it moves", async () => {
    render(
      <EventRow
        ev={ev({ event: "Consumer Price Index (CPI)", ticker: null, category: "inflation" })}
        isWatchlist={false}
        held={new Map([["SPY", 100], ["XOM", 40]])}
      />
    );
    await expand(/CPI/);
    expect(screen.getByText("you hold")).toBeInTheDocument();
    // CPI's meta names SPY, QQQ, IWM and TLT — XOM is held but not one of them,
    // and with four on the row the chip has to say which one you own.
    expect(screen.getByRole("link", { name: "SPY +100" })).toHaveTextContent("SPY +100");
    expect(screen.queryByText(/XOM/)).not.toBeInTheDocument();
  });

  it("says nothing about a book it has not been given", async () => {
    render(<EventRow ev={ev()} isWatchlist={false} />);
    await expand(/NVDA/);
    expect(screen.queryByText("you hold")).not.toBeInTheDocument();
  });

  it("says nothing when you hold none of the names the event moves", async () => {
    render(<EventRow ev={ev()} isWatchlist={false} held={new Map([["XOM", 40]])} />);
    await expand(/NVDA/);
    expect(screen.queryByText("you hold")).not.toBeInTheDocument();
  });
});
