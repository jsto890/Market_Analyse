// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { MacroGauges } from "@/components/rails/MacroGauges";
import * as macroLib from "@/lib/macro";

vi.mock("@/lib/macro", async (importOriginal) => {
  const actual = await importOriginal<typeof macroLib>();
  return { ...actual, useMacro: vi.fn() };
});

describe("MacroGauges (LR-07, LR-06)", () => {
  it("fills the gauge bar with bg-model — a sentiment score is model output, not P&L", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({
      data: { gauges: [{ scope: "global", window: "1d", score: 0.3, n: 12, ts: "2026-07-28T00:00:00Z" }] },
    } as ReturnType<typeof macroLib.useMacro>);
    render(<MacroGauges window="1d" />);
    expect(document.querySelector(".bg-model")).not.toBeNull();
    expect(document.querySelector(".bg-pos")).toBeNull();
    expect(document.querySelector(".bg-neg")).toBeNull();
    expect(document.querySelector(".bg-accent")).toBeNull();
  });

  it("wraps in a border-line-strong container, not the standard border-line", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({ data: { gauges: [] } } as any);
    render(<MacroGauges window="1d" />);
    expect(document.querySelector(".border-line-strong")).not.toBeNull();
  });

  it("shows the shared Loading idiom while no gauge has been built yet", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({ data: { gauges: [] } } as any);
    render(<MacroGauges window="1d" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Building macro gauges");
    expect(status.className).not.toContain("opacity-60");
  });
});

describe("MacroGauges deep link (MC-06)", () => {
  it("carries the selected window into the /macro link", async () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({
      data: { gauges: [{ scope: "global", window: "1w", score: 0.1, n: 10, ts: "2026-07-28T00:00:00Z" }] },
    } as ReturnType<typeof macroLib.useMacro>);
    render(<MacroGauges window="1w" />);
    const link = await screen.findByRole("link", { name: "1w →" });
    expect(link).toHaveAttribute("href", "/macro?window=1w");
  });

  it("reads as a link — accent and the departure arrow, not muted mono with a chevron (R-08)", async () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({
      data: { gauges: [{ scope: "global", window: "1d", score: 0.1, n: 10, ts: "2026-07-28T00:00:00Z" }] },
    } as ReturnType<typeof macroLib.useMacro>);
    render(<MacroGauges window="1d" />);
    const link = await screen.findByRole("link", { name: "1d →" });
    expect(link.className).toContain("text-accent");
    expect(link.className).not.toContain("text-muted");
  });

  it("keeps the score itself off P&L green/red — it is model output (R-08)", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({
      data: {
        gauges: [
          { scope: "global", window: "1d", score: 0.42, n: 12, ts: "2026-07-28T00:00:00Z" },
          { scope: "us", window: "1d", score: -0.42, n: 12, ts: "2026-07-28T00:00:00Z" },
        ],
      },
    } as ReturnType<typeof macroLib.useMacro>);
    render(<MacroGauges window="1d" />);
    for (const score of ["+0.42", "-0.42"]) {
      const el = screen.getByText(score);
      expect(el.className).toContain("text-model");
      expect(el.className).not.toContain("text-pos");
      expect(el.className).not.toContain("text-neg");
    }
  });
});
