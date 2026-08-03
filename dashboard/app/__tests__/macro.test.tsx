import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import MacroPage from "@/app/macro/page";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

describe("Macro — methodology", () => {
  it("names exactly the mock's four columns", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    for (const heading of ["Input", "Scoring", "Weighting", "What it isn't"]) {
      expect(await screen.findByText(heading)).toBeInTheDocument();
    }
  });

  it("collapses, and states the real half-life rather than the mock's", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    expect(await screen.findByText(/half-life of 12 hours/)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /How this score is computed/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
