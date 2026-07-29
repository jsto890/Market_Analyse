import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import Select from "@/components/ui/Select";

const OPTIONS = [
  { value: "all", label: "All groups" },
  { value: "prime", label: "Prime long" },
];

describe("Select", () => {
  it("renders one <option> per entry with the given label", () => {
    render(<Select options={OPTIONS} value="all" onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "All groups" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Prime long" })).toBeInTheDocument();
  });

  it("reports the selected value via onChange", async () => {
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="all" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "prime");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("never sets focus:outline-none", () => {
    render(<Select options={OPTIONS} value="all" onChange={() => {}} />);
    expect(screen.getByRole("combobox").className).not.toMatch(/outline-none/);
  });

  it("uses h-8 sizing", () => {
    render(<Select options={OPTIONS} value="all" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveClass("h-8", "rounded");
  });
});
