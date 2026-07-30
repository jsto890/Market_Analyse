import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import GlossaryPage from "@/app/glossary/page";

describe("GlossaryPage", () => {
  it("renders a HEADER_GLOSS term with an anchor id matching glossarySlug()", () => {
    render(<GlossaryPage />);
    const dt = screen.getByText("RS-Ratio");
    expect(dt.closest("div")).toHaveAttribute("id", "rs-ratio");
  });

  it("renders the combo-decode positions and letters sections", () => {
    render(<GlossaryPage />);
    expect(screen.getByText("ma_trend")).toBeInTheDocument();
    expect(screen.getByText("breakout")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("links back to Today", () => {
    render(<GlossaryPage />);
    expect(screen.getByText("← Today")).toHaveAttribute("href", "/");
  });
});
