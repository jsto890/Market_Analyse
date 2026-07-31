import { describe, it, expect } from "vitest";
import { render, screen, within } from "@/test/render";
import GlossaryPage from "@/app/learn/glossary/page";

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
    // "L" also appears as a HEADER_GLOSS key (SC-05) — scope to the letters section.
    const lettersHeading = screen.getByRole("heading", { name: /combo decode — letters/i });
    const lettersSection = lettersHeading.closest("section")!;
    expect(within(lettersSection).getByText("L")).toBeInTheDocument();
  });

  it("links back to the Learn index", () => {
    render(<GlossaryPage />);
    expect(screen.getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
  });
});
