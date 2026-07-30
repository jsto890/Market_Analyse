import { vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import SymbolSwitcher from "../SymbolSwitcher";

describe("SymbolSwitcher", () => {
  it("highlights the active symbol with tokenised (not raw-palette) classes and calls onChange when another is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SymbolSwitcher active="SPY" onChange={onChange} />);
    const active = screen.getByRole("button", { name: "SPY" });
    expect(active.className).toMatch(/bg-accent-dim/);
    expect(active.className).not.toMatch(/bg-green-500/);
    await user.click(screen.getByRole("button", { name: "QQQ" }));
    expect(onChange).toHaveBeenCalledWith("QQQ");
  });
});
