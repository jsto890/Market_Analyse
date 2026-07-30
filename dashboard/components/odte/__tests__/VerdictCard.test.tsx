import { render, screen } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import userEvent from "@testing-library/user-event";
import VerdictCard from "../VerdictCard";

const verdict = { status: "good" as const, sentence: "Bullish, low pin risk." };

describe("VerdictCard", () => {
  beforeEach(() => resetLocalStorage());

  it("expands via the shared Collapsible primitive and shows detail with no duplicate 'Open strikes' link (OD-04, OD-08)", async () => {
    const user = userEvent.setup();
    render(<VerdictCard title="Flow" verdict={verdict} detail={<p>Detail content</p>} />);
    const trigger = screen.getByRole("button", { name: /flow/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Detail content")).toBeInTheDocument();
    expect(screen.queryByText(/open strikes/i)).not.toBeInTheDocument();
  });

  it("disables the trigger with a reason when there is nothing to expand (OD-08)", () => {
    render(<VerdictCard title="Flow" verdict={null} loading={false} />);
    const trigger = screen.getByRole("button", { name: /flow/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute(
      "title",
      "No detail available until the verdict finishes loading"
    );
  });

  it("persists its expand state per verdict title across remounts (OD-08)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <VerdictCard title="Flow" verdict={verdict} detail={<p>Detail content</p>} />
    );
    await user.click(screen.getByRole("button", { name: /flow/i }));
    unmount();
    render(<VerdictCard title="Flow" verdict={verdict} detail={<p>Detail content</p>} />);
    expect(
      await screen.findByRole("button", { name: /flow/i, expanded: true })
    ).toBeInTheDocument();
  });
});
