import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import EmptyState, { type EmptyStateProps } from "@/components/ui/EmptyState";

describe("EmptyState", () => {
  it("renders the default message when none is given", () => {
    render(<EmptyState />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders a custom message, icon, and action together", () => {
    const props: EmptyStateProps = {
      message: "No results above threshold.",
      icon: <span data-testid="custom-icon" />,
      action: <button type="button">Clear filters</button>,
    };
    render(<EmptyState {...props} />);
    expect(screen.getByText("No results above threshold.")).toBeInTheDocument();
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });
});
