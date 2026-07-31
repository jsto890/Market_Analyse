import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { PageShell } from "@/components/PageShell";

describe("PageShell", () => {
  it("defaults to the standard width and owns the page gutter", () => {
    render(
      <PageShell>
        <p>content</p>
      </PageShell>
    );
    const shell = screen.getByText("content").parentElement;
    expect(shell).toHaveClass("max-w-[1040px]");
    expect(shell).toHaveClass("px-[var(--page-x)]");
    expect(shell).toHaveClass("py-[var(--page-y)]");
  });

  it("switches to the wide width for data-heavy pages", () => {
    render(
      <PageShell width="wide">
        <p>grid</p>
      </PageShell>
    );
    expect(screen.getByText("grid").parentElement).toHaveClass("max-w-[1440px]");
  });

  it("grows to fill the column so short pages don't strand the viewport", () => {
    render(
      <PageShell>
        <p>short</p>
      </PageShell>
    );
    const shell = screen.getByText("short").parentElement;
    expect(shell).toHaveClass("min-h-full");
    expect(shell).toHaveClass("flex-col");
  });

  it("drops the gutter when the page paints its own full-bleed chrome", () => {
    render(
      <PageShell width="full" flush>
        <p>ladder</p>
      </PageShell>
    );
    const shell = screen.getByText("ladder").parentElement;
    expect(shell).toHaveClass("max-w-none");
    expect(shell).not.toHaveClass("px-[var(--page-x)]");
  });
});
