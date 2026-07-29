import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import Input from "@/components/ui/Input";
import { Search } from "lucide-react";

describe("Input", () => {
  it("renders a text input and reports typed value", async () => {
    const onChange = vi.fn();
    render(<Input placeholder="Filter tickers" onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText("Filter tickers"), "AAPL");
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("never sets focus:outline-none", () => {
    render(<Input placeholder="x" />);
    expect(screen.getByPlaceholderText("x").className).not.toMatch(/outline-none/);
  });

  it("adds left padding and renders the icon when icon is supplied", () => {
    render(<Input icon={<Search data-testid="icon" size={14} />} placeholder="Search" />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search")).toHaveClass("pl-8");
  });

  it("sets aria-invalid and the neg border when invalid", () => {
    render(<Input invalid placeholder="Bad" />);
    const el = screen.getByPlaceholderText("Bad");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(el).toHaveClass("border-neg");
  });

  it("does not set aria-invalid when not invalid", () => {
    render(<Input placeholder="Good" />);
    expect(screen.getByPlaceholderText("Good")).not.toHaveAttribute("aria-invalid");
  });
});
