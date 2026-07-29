import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import CenterBar from "@/components/ui/CenterBar";

describe("CenterBar", () => {
  it("defaults to 56x8", () => {
    const { container } = render(<CenterBar value={0.4} />);
    const track = container.querySelector("span > span") as HTMLElement;
    expect(track.style.width).toBe("56px");
    expect(track.style.height).toBe("8px");
  });

  it("accepts a custom width/height", () => {
    const { container } = render(<CenterBar value={0.4} width={100} height={8} />);
    const track = container.querySelector("span > span") as HTMLElement;
    expect(track.style.width).toBe("100px");
  });

  it("clamps value to [-1, 1] without throwing", () => {
    render(<CenterBar value={5} />);
    render(<CenterBar value={-5} />);
  });

  it("renders the em-dash fallback for non-finite values", () => {
    render(<CenterBar value={NaN} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a signed numeric label only when showValue is true", () => {
    const { rerender } = render(<CenterBar value={0.42} />);
    expect(screen.queryByText("+0.42")).not.toBeInTheDocument();
    rerender(<CenterBar value={0.42} showValue />);
    expect(screen.getByText("+0.42")).toBeInTheDocument();
  });
});
