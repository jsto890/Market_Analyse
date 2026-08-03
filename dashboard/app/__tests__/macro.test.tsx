import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import MacroPage from "@/app/macro/page";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

describe("Macro — methodology", () => {
  it("names exactly the mock's four columns", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    for (const heading of ["Input", "Scoring", "Weighting", "What it isn’t"]) {
      expect(await screen.findByText(heading)).toBeInTheDocument();
    }
  });

  it("collapses, and states the real half-life rather than the mock's", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    expect(await screen.findByText(/half-life of 12 hours/)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /How this score is computed/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Macro — scope tiles", () => {
  it("says how tiles are ordered and what clicking one does, once they are movement-ranked", async () => {
    mockFetchJson((url: string) => {
      if (url.startsWith("/api/argus/macro/tiles")) {
        return {
          window: "1d",
          tiles: [
            { scope: "global", score: 0.1, n: 50, ts: "2026-07-28T00:00:00Z", delta_1h: 0.02, delta_1d: -0.04, spark: [] },
            { scope: "sector:AI / Compute", score: 0.3, n: 10, ts: "2026-07-28T00:00:00Z", delta_1h: null, delta_1d: 0.12, spark: [] },
          ],
        };
      }
      return {};
    });
    render(<MacroPage />);
    expect(
      await screen.findByText("market first, then biggest movers · click any tile for its headlines")
    ).toBeInTheDocument();
  });

  it("drops the ordering claim, but still explains the click, when there are no ranked tiles", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    expect(await screen.findByText("click any tile for its headlines")).toBeInTheDocument();
  });
});
