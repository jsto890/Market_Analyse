import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import Button from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";

describe("Button", () => {
  it("renders children and calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("defaults to h-8 secondary styling", () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole("button", { name: "Default" });
    expect(btn).toHaveClass("h-8", "border-line", "bg-raised");
  });

  it("never sets focus:outline-none", () => {
    render(<Button>Focusable</Button>);
    expect(screen.getByRole("button", { name: "Focusable" }).className).not.toMatch(/outline-none/);
  });

  it("applies the primary variant classes", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass("border-accent", "bg-accent-dim", "text-accent");
  });

  it("applies the danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("border-neg/50", "bg-neg/10", "text-neg");
  });

  it("applies the sm size classes", () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button", { name: "Small" })).toHaveClass("h-7", "px-2.5");
  });

  it("disables the button and blocks onClick while loading", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Run</Button>);
    const btn = screen.getByRole("button", { name: "Run" });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders a leading icon when not loading", () => {
    render(<Button icon={<ArrowRight data-testid="icon" size={14} />}>Go</Button>);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});
