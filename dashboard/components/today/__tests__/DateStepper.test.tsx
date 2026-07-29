import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import DateStepper from "@/components/today/DateStepper";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("DateStepper", () => {
  it("shows the current date and disables Next on the latest date", () => {
    render(
      <DateStepper dates={["2026-07-27", "2026-07-28", "2026-07-29"]} current="2026-07-29" />
    );
    expect(screen.getByText("2026-07-29")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("navigates to the previous date on click", async () => {
    const user = userEvent.setup();
    render(
      <DateStepper dates={["2026-07-27", "2026-07-28", "2026-07-29"]} current="2026-07-29" />
    );
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(push).toHaveBeenCalledWith("/?date=2026-07-28");
  });

  it("returns to the un-parameterised URL when stepping to the latest date", async () => {
    const user = userEvent.setup();
    render(
      <DateStepper dates={["2026-07-27", "2026-07-28", "2026-07-29"]} current="2026-07-28" />
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("renders nothing when there is only one date on record", () => {
    const { container } = render(<DateStepper dates={["2026-07-29"]} current="2026-07-29" />);
    expect(container).toBeEmptyDOMElement();
  });
});
