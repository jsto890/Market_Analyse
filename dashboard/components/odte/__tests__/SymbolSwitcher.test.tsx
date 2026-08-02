import { vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import SymbolSwitcher from "../SymbolSwitcher";

describe("SymbolSwitcher", () => {
  it("renders the underlyings as segmented controls, marks the active one, and reports a switch", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SymbolSwitcher active="SPY" onChange={onChange} />);
    const active = screen.getByRole("radio", { name: "SPY" });
    expect(active).toHaveAttribute("aria-checked", "true");
    // The segmented control's own active surface, not a raw palette class.
    expect(active.className).toMatch(/bg-raised/);
    expect(active.className).not.toMatch(/bg-green-500/);
    await user.click(screen.getByRole("radio", { name: "QQQ" }));
    expect(onChange).toHaveBeenCalledWith("QQQ");
  });

  it("keeps every underlying the app answers for, indices included", () => {
    render(<SymbolSwitcher active="SPY" onChange={vi.fn()} />);
    for (const symbol of ["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"]) {
      expect(screen.getByRole("radio", { name: symbol })).toBeInTheDocument();
    }
  });
});
