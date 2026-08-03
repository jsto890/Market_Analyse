import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import HistoryCard from "@/components/ticker/HistoryCard";

const rows = Array.from({ length: 13 }, (_, i) => ({
  date: `2026-0${(i % 9) + 1}-01`,
  report_group: "aligned",
  action_label: "PRIME_LONG",
  combined_score: 1.2,
  entry: 100 + i,
}));

describe("HistoryCard", () => {
  it("shows 10 rows and an expand toggle when there are more than 10", () => {
    render(<HistoryCard rows={rows} lastClose={110} />);
    expect(screen.getAllByRole("row")).toHaveLength(11); // 1 header + 10 shown
    expect(screen.getByText("+3 older — show all")).toBeInTheDocument();
  });

  it("expands to show all rows and collapses back on toggle click", async () => {
    const user = userEvent.setup();
    render(<HistoryCard rows={rows} lastClose={110} />);

    await user.click(screen.getByText("+3 older — show all"));
    expect(screen.getAllByRole("row")).toHaveLength(14); // 1 header + 13 shown
    expect(screen.getByText("Show fewer")).toBeInTheDocument();

    await user.click(screen.getByText("Show fewer"));
    expect(screen.getAllByRole("row")).toHaveLength(11);
  });

  it("does not show a toggle when rows are within the 10-row cap", () => {
    render(<HistoryCard rows={rows.slice(0, 5)} lastClose={110} />);
    expect(screen.queryByText(/older/)).toBeNull();
  });

  it("reads the tier as copy, not as the column it came out of (TH-02)", () => {
    render(<HistoryCard rows={rows.slice(0, 2)} lastClose={110} />);
    expect(screen.getAllByText("Extended")).toHaveLength(2);
    expect(screen.queryByText("PRIME_LONG")).toBeNull();
  });
});
