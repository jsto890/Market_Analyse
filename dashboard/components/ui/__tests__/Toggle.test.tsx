import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import Toggle from "@/components/ui/Toggle";

describe("Toggle", () => {
  it("renders role=switch with aria-checked reflecting the checked prop", () => {
    render(<Toggle checked={false} onChange={() => {}} label="Logarithmic Y-axis" />);
    const el = screen.getByRole("switch", { name: "Logarithmic Y-axis" });
    expect(el).toHaveAttribute("aria-checked", "false");
  });

  it("reflects checked=true", () => {
    render(<Toggle checked onChange={() => {}} label="Logarithmic Y-axis" />);
    expect(screen.getByRole("switch", { name: "Logarithmic Y-axis" })).toHaveAttribute("aria-checked", "true");
  });

  it("calls onChange with the inverted value on click", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Enable rule" />);
    await userEvent.click(screen.getByRole("switch", { name: "Enable rule" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("disables the switch and blocks onChange when disabled", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Enable rule" disabled />);
    const el = screen.getByRole("switch", { name: "Enable rule" });
    expect(el).toBeDisabled();
    await userEvent.click(el);
    expect(onChange).not.toHaveBeenCalled();
  });
});
