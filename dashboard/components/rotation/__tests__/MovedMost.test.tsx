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
});
