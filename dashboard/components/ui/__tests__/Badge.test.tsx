import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import Badge from "@/components/ui/Badge";

/** Badges are addressed by the enum they carry, which is what survives the
 *  display-copy mapping (TH-02). */
function badge(value: string): HTMLElement {
  return document.querySelector(`[data-value="${value}"]`) as HTMLElement;
}

describe("Badge", () => {
  it("renders display copy, not the raw enum, without being asked (TH-02)", () => {
    render(
      <>
        <Badge variant="verdict" value="LONG" />
        <Badge variant="tier" value="STANDARD_LONG" />
      </>
    );
    expect(screen.getByText("Long")).toBeInTheDocument();
    expect(screen.getByText("Trending")).toBeInTheDocument();
    expect(screen.queryByText("STANDARD_LONG")).not.toBeInTheDocument();
    // text-micro shouts; display copy is a phrase, so it opts out.
    expect(badge("STANDARD_LONG")).toHaveClass("normal-case");
  });

  it("maps known tier values onto --model, never P&L green", () => {
    render(<Badge variant="tier" value="PRIME_LONG" />);
    expect(badge("PRIME_LONG")).toHaveClass("bg-model/[0.14]", "text-model");
  });

  it("draws no tint ladder across the long tiers — the OOS ranking is inverted", () => {
    // This used to assert PRIME > BREAKOUT > STANDARD saturation. The
    // 2015-2024 OOS backtest (75,385 signals) found the tier order ranks
    // trailing strength and carries no forward information, with PRIME_LONG
    // the weakest forward-20d bucket — so a descending ramp was drawing a
    // conviction ranking the data does not support. Equal weight is the claim.
    render(
      <>
        <Badge variant="tier" value="PRIME_LONG" />
        <Badge variant="tier" value="BREAKOUT_LONG" />
        <Badge variant="tier" value="STANDARD_LONG" />
      </>
    );
    for (const tier of ["PRIME_LONG", "BREAKOUT_LONG", "STANDARD_LONG"]) {
      expect(badge(tier)).toHaveClass("bg-model/[0.14]", "border-model/40");
    }
  });

  it("maps known verdict values onto --model — direction is carried by the word", () => {
    render(
      <>
        <Badge variant="verdict" value="LONG" />
        <Badge variant="verdict" value="SHORT" />
      </>
    );
    expect(badge("LONG")).toHaveClass("text-model");
    expect(badge("SHORT")).toHaveClass("text-model");
  });

  it("puts no P&L colour on any model badge", () => {
    const { container } = render(
      <>
        <Badge variant="tier" value="PRIME_LONG" />
        <Badge variant="verdict" value="SHORT" />
        <Badge variant="edge" value="HOLD/ADD" />
      </>
    );
    expect(container.innerHTML).not.toMatch(/(bg|text|border)-(pos|neg)\b/);
  });

  it("carries the raw enum on data-value, not a mouse-only title", () => {
    render(<Badge variant="tier" value="PRIME_LONG" label="Prime long" />);
    const el = screen.getByText("Prime long");
    expect(el).toHaveAttribute("data-value", "PRIME_LONG");
    expect(el).not.toHaveAttribute("title");
  });

  it("falls back to the muted token for an unknown tier value", () => {
    render(<Badge variant="tier" value="UNKNOWN_TIER" />);
    expect(screen.getByText("UNKNOWN_TIER")).toHaveClass("bg-muted/10", "text-muted");
  });
});

describe("Badge edge variant (PF-08)", () => {
  it("colors HOLD/ADD as model output and CONSIDER SELLING as a warning", () => {
    render(
      <>
        <Badge variant="edge" value="HOLD/ADD" />
        <Badge variant="edge" value="CONSIDER SELLING" />
      </>
    );
    expect(screen.getByText("HOLD/ADD").className).toContain("bg-model");
    expect(screen.getByText("CONSIDER SELLING").className).toContain("bg-warn");
  });
});
