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

  it("prints a count inside its own segment, and none where an option has no count", () => {
    render(
      <SegmentedControl
        label="Group"
        value="aligned"
        options={[
          { key: "aligned", label: "Aligned", count: 12 },
          { key: "rest", label: "Everything else" },
        ]}
        onChange={() => {}}
      />
    );
    const aligned = screen.getByRole("radio", { name: "Aligned 12" });
    expect(within(aligned).getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Everything else" })).toHaveTextContent(
      /^Everything else$/
    );
  });

  it("renders a zero count rather than swallowing it", () => {
    render(
      <SegmentedControl
        label="Group"
        value="a"
        options={[
          { key: "a", label: "Aligned", count: 0 },
          { key: "b", label: "Pulling back", count: 4 },
        ]}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("radio", { name: "Aligned 0" })).toBeInTheDocument();
  });

  it("dims the count to --text-3 on the active segment and lets it inherit elsewhere", () => {
    // The active segment's label is --text; its count must sit a step back so
    // the word is what you read first. An inactive segment is already --muted,
    // so its count inherits rather than fighting the label.
    render(
      <SegmentedControl
        label="Group"
        value="aligned"
        options={[
          { key: "aligned", label: "Aligned", count: 12 },
          { key: "pulling", label: "Pulling back", count: 4 },
        ]}
        onChange={() => {}}
      />
    );
    const activeCount = within(screen.getByRole("radio", { name: "Aligned 12" })).getByText("12");
    expect(activeCount).toHaveClass("text-3");
    const idleCount = within(screen.getByRole("radio", { name: "Pulling back 4" })).getByText("4");
    expect(idleCount).not.toHaveClass("text-3");
    // 11px mono tabular, on both.
    for (const el of [activeCount, idleCount]) {
      expect(el).toHaveClass("text-micro", "font-mono", "tabular-nums");
    }
  });

  it("keeps counts out of the pills variant's way", () => {
    // `pills` exists to break two controls sharing a row apart; the mock's
    // segmented spec does not apply to it, but a count still has to render.
    render(
      <SegmentedControl
        label="Group"
        variant="pills"
        value="a"
        options={[
          { key: "a", label: "Aligned", count: 12 },
          { key: "b", label: "Pulling back", count: 4 },
        ]}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("radio", { name: "Aligned 12" })).toHaveClass("border");
  });

  it("speaks the tab vocabulary when asked, and names the region each tab owns", () => {
    render(
      <SegmentedControl
        label="Board"
        value="live"
        as="tablist"
        options={[
          { key: "eod", label: "EOD", id: "tab-eod", controls: "panel-eod" },
          { key: "live", label: "Live", id: "tab-live", controls: "panel-live" },
        ]}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("tablist", { name: "Board" })).toBeInTheDocument();
    const live = screen.getByRole("tab", { name: "Live" });
    expect(live).toHaveAttribute("aria-selected", "true");
    expect(live).toHaveAttribute("aria-controls", "panel-live");
    expect(live).toHaveAttribute("id", "tab-live");
    expect(screen.getByRole("tab", { name: "EOD" })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("carries no title attributes", () => {
    const { container } = render(
      <SegmentedControl label="Data" value="eod" options={OPTIONS} onChange={() => {}} />
    );
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });
});
