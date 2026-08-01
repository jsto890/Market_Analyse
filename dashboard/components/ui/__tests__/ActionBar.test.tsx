import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import ActionBar from "@/components/ui/ActionBar";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ watchlist: [] }), { status: 200 }))
  );
});

describe("ActionBar", () => {
  it("gives every verb a destination built from the symbol", () => {
    render(<ActionBar symbol="NVDA" actions={["alert", "options", "compare", "copy", "open"]} />);
    expect(screen.getByRole("link", { name: "Alert" })).toHaveAttribute("href", "/alerts?symbol=NVDA");
    expect(screen.getByRole("link", { name: "Options" })).toHaveAttribute("href", "/t/NVDA#options");
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/screener?symbols=NVDA");
    expect(screen.getByRole("link", { name: "Open →" })).toHaveAttribute("href", "/t/NVDA");
    expect(screen.getByRole("button", { name: "Copy NVDA" })).toBeInTheDocument();
  });

  it("defaults to four verbs on one row — Compare and Copy are ticker-page actions (G6)", () => {
    const { container } = render(<ActionBar symbol="NVDA" fill />);
    const verbs = Array.from(container.querySelectorAll("a, button")).map((el) => el.textContent);
    expect(verbs).toEqual(["Pin", "Alert", "Options", "Open →"]);
    expect(container.firstElementChild!.className).not.toContain("flex-wrap");
  });

  it("points Options at the block on the page when the caller supplies an anchor", () => {
    render(<ActionBar symbol="NVDA" optionsHref="#options" />);
    expect(screen.getByRole("link", { name: "Options" })).toHaveAttribute("href", "#options");
  });

  it("renders only the actions the surface asked for, in that order", () => {
    const { container } = render(<ActionBar symbol="NVDA" actions={["copy", "alert"]} />);
    expect(Array.from(container.querySelectorAll("a, button")).map((el) => el.textContent)).toEqual([
      "Copy",
      "Alert",
    ]);
  });

  it("copies the bare symbol and says so", async () => {
    const user = userEvent.setup();
    // After setup(), not before: user-event installs its own clipboard stub.
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ActionBar symbol="NVDA" actions={["copy"]} />);
    await user.click(screen.getByRole("button", { name: "Copy NVDA" }));
    expect(writeText).toHaveBeenCalledWith("NVDA");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
