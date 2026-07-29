import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import RailShell from "@/components/rails/RailShell";

vi.mock("@/components/rails/LeftRail", () => ({
  LeftRail: () => <aside data-testid="left-rail">left</aside>,
}));
vi.mock("@/components/rails/RightRail", () => ({
  RightRail: () => <aside data-testid="right-rail">right</aside>,
}));

describe("RailShell", () => {
  it("puts main content before the rails in DOM order, with a focusable #main skip target (G-11, A11Y-05)", () => {
    render(
      <RailShell>
        <p>page body</p>
      </RailShell>
    );

    const main = document.getElementById("main");
    expect(main).not.toBeNull();
    expect(main).toHaveTextContent("page body");
    expect(main).toHaveAttribute("tabIndex", "-1");

    const left = screen.getByTestId("left-rail");
    const right = screen.getByTestId("right-rail");
    expect(main!.compareDocumentPosition(left) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main!.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the content column visually between the rails via order-2", () => {
    render(
      <RailShell>
        <p>page body</p>
      </RailShell>
    );
    expect(document.getElementById("main")).toHaveClass("order-2");
  });
});
