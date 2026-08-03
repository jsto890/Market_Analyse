import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import MovedMost from "@/components/rotation/MovedMost";
import type { RotationRow } from "@/components/today/RotationPanel";

function row(over: Partial<RotationRow>): RotationRow {
  return {
    industry: "Uranium", quadrant: "leading", rs_ratio: 103.2, rs_mom: 102.4,
    breadth: 60, n: 25, r1w: 1.2, r1m: 4.8, r3m: 9.0, rank: 1, drank: 1, ...over,
  };
}

describe("MovedMost", () => {
  it("ranks by the size of the rank change, not its sign", () => {
    render(
      <MovedMost
        rows={[
          row({ industry: "Uranium", drank: 2 }),
          row({ industry: "Aerospace & Defense", drank: -7 }),
          row({ industry: "Software—Application", drank: 4 }),
        ]}
        selected={null}
        onSelect={() => {}}
      />
    );
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names[0]).toContain("Aerospace & Defense");
    expect(names[1]).toContain("Software—Application");
  });

  it("signs the move and names the quadrant it landed in", () => {
    render(
      <MovedMost rows={[row({ drank: 4, quadrant: "improving" })]} selected={null} onSelect={() => {}} />
    );
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("Improving")).toBeInTheDocument();
  });

  it("selects a sector when its row is clicked", async () => {
    const onSelect = vi.fn();
    render(<MovedMost rows={[row({ drank: 4 })]} selected={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Uranium/ }));
    expect(onSelect).toHaveBeenCalledWith("Uranium");
  });

  it("renders nothing when no row carries a rank change", () => {
    const { container } = render(
      <MovedMost rows={[row({ drank: null })]} selected={null} onSelect={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("drops null and zero rank-change rows and keeps only the top-N=4 survivors", () => {
    render(
      <MovedMost
        rows={[
          row({ industry: "A", drank: null }),
          row({ industry: "B", drank: 0 }),
          row({ industry: "C", drank: 5 }),
          row({ industry: "D", drank: -3 }),
          row({ industry: "E", drank: 8 }),
          row({ industry: "F", drank: -1 }),
          row({ industry: "G", drank: 2 }),
        ]}
        selected={null}
        onSelect={() => {}}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    const names = buttons.map((b) => b.textContent ?? "");
    // A and B are dropped by the filter, F by the cap — five rows qualify and
    // only four may render, so removing `.slice(0, TOP_N)` brings F back.
    expect(names.some((n) => n.includes("A"))).toBe(false);
    expect(names.some((n) => n.includes("B"))).toBe(false);
    expect(names.some((n) => n.includes("F"))).toBe(false);
    expect(names[0]).toContain("E");
    expect(names[1]).toContain("C");
    expect(names[2]).toContain("D");
    expect(names[3]).toContain("G");
  });
});
