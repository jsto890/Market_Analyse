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
  it("renders a positive gauge with the green bg-pos fill, not bg-accent", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({
      data: { gauges: [{ scope: "global", window: "1d", score: 0.3, n: 12, ts: "2026-07-28T00:00:00Z" }] },
    } as ReturnType<typeof macroLib.useMacro>);
    render(<MacroGauges window="1d" />);
    expect(document.querySelector(".bg-pos")).not.toBeNull();
    expect(document.querySelector(".bg-accent")).toBeNull();
  });

  it("wraps in a border-line-strong container, not the standard border-line", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({ data: { gauges: [] } } as any);
    render(<MacroGauges window="1d" />);
    expect(document.querySelector(".border-line-strong")).not.toBeNull();
  });

  it("renders the building… empty state with a token color, not opacity-60", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({ data: { gauges: [] } } as any);
    render(<MacroGauges window="1d" />);
    const empty = screen.getByText("building…");
    expect(empty.className).toContain("text-muted-2");
    expect(empty.className).not.toContain("opacity-60");
  });
});
