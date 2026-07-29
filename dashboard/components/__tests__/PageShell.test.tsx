import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { PageShell } from "@/components/PageShell";

describe("PageShell", () => {
  it("defaults to the reading width and owns its own scroll container (G-08, G-09)", () => {
    render(
      <PageShell>
        <p>content</p>
      </PageShell>
    );
    const shell = screen.getByText("content").parentElement;
    expect(shell).toHaveClass("max-w-5xl");
    expect(shell).toHaveClass("overflow-y-auto");
  });

  it("switches to the dense width for data-heavy pages", () => {
    render(
      <PageShell width="dense">
        <p>grid</p>
      </PageShell>
    );
    expect(screen.getByText("grid").parentElement).toHaveClass("max-w-[1400px]");
  });
});
