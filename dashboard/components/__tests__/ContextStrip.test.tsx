import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import ContextStrip from "@/components/ContextStrip";

describe("ContextStrip SYS pill", () => {
  it("is real button, closed default, opened on click — not hover-only (G-06)", async () => {
    mockFetchJson({
      "/api/status": {
        aggregate: "ok",
        services: [{ name: "bridge", state: "ok", detail: "fresh" }],
        bridgeTime: null,
      },
    });

    render(<ContextStrip />);
    const trigger = await screen.findByRole("button", { name: "System status" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("bridge")).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("bridge")).toBeInTheDocument();
  });

  it("shows bridge time and quotes age so staleness is visible at a glance (G-07)", async () => {
    mockFetchJson({
      "/api/status": {
        aggregate: "ok",
        services: [],
        bridgeTime: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      "/api/argus/rail/quotes": {
        quotes: [],
        groups: { futures: [], indices: [], forex: [] },
        error: null,
      },
    });

    render(<ContextStrip />);

    // Both freshness readouts now go through the shared `Stale` idiom, which
    // prints provenance and age rather than a hand-rolled "bridge HH:MM" string.
    const bridge = await screen.findByText("· bridge");
    expect(bridge.parentElement!.textContent).toMatch(/as of \d{1,2}:\d{2} · \d+m ago/);

    const quotes = await screen.findByText("· quotes");
    expect(quotes.parentElement!.textContent).toMatch(/as of \d{1,2}:\d{2} · \d+s ago/);
  });
});

describe("ContextStrip market clock", () => {
  it("states the exchange time, not just which session it is", async () => {
    mockFetchJson({ "/api/status": { aggregate: "ok", services: [], bridgeTime: null } });
    render(<ContextStrip />);
    const clock = await screen.findByText(/^\d{2}:\d{2} ET$/);
    // Same wall clock the session chip is derived from, so the two never disagree.
    const et = new Date().toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect(clock).toHaveTextContent(`${et} ET`);
  });
});
