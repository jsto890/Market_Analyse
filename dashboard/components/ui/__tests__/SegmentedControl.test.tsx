import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/render";
import SegmentedControl from "@/components/ui/SegmentedControl";

const OPTIONS = [
  { key: "eod", label: "EOD", blurb: "yesterday's close" },
  { key: "live", label: "Live", blurb: "streaming quotes" },
] as const;

describe("SegmentedControl", () => {
  it("states the control's name in visible text, not only as an aria-label", () => {
    render(<SegmentedControl label="Data" value="eod" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Data" })).toBeInTheDocument();
  });

  it("marks exactly one segment checked", () => {
    render(<SegmentedControl label="Data" value="live" options={OPTIONS} onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Data" });
    expect(within(group).getByRole("radio", { name: "Live" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "EOD" })).toHaveAttribute("aria-checked", "false");
  });

  it("passes the clicked option's key to onChange", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Data" value="eod" options={OPTIONS} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Live" }));
    expect(onChange).toHaveBeenCalledWith("live");
  });

  it("shows the selected option's blurb, and only that one", () => {
    // A per-option tooltip documents whichever mode you are not using. The
    // blurb belongs to the mode you are in.
    render(<SegmentedControl label="Data" value="eod" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByText("yesterday's close")).toBeInTheDocument();
    expect(screen.queryByText("streaming quotes")).not.toBeInTheDocument();
  });

  it("carries no title attributes", () => {
    const { container } = render(
      <SegmentedControl label="Data" value="eod" options={OPTIONS} onChange={() => {}} />
    );
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });
});
