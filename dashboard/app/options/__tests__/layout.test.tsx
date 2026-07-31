import { vi } from "vitest";
import { render, screen, within } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage } from "@/test/localStorage";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/options/ladder" }));

import OptionsLayout from "@/app/options/layout";
import { OPTIONS_TABS } from "@/lib/optionsUi";

describe("OptionsLayout — one page became five (OPT-07)", () => {
  beforeEach(() => {
    resetLocalStorage();
    mockFetchJson({ "/api/odte/health": { ok: true, ibkr_connected: true } });
  });

  it("offers a tab per section, and states the current one's blurb in view", async () => {
    // The blurb used to be a native title on every tab — mouse-only, and only
    // for whichever tab you happened to hover. The active tab states it inline.
    render(<OptionsLayout>{null}</OptionsLayout>);
    const nav = screen.getByRole("navigation", { name: /options sections/i });
    for (const t of OPTIONS_TABS) {
      const link = screen.getByRole("link", { name: t.label });
      expect(link).toHaveAttribute("href", t.href);
      expect(link).not.toHaveAttribute("title");
      expect(nav).toContainElement(link);
    }
    const active = OPTIONS_TABS.find((t) => t.href === "/options/ladder")!;
    expect(within(nav).getByText(active.blurb)).toBeInTheDocument();
  });

  it("marks the current tab for assistive tech", () => {
    render(<OptionsLayout>{null}</OptionsLayout>);
    expect(screen.getByRole("link", { name: "Ladder" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("names the data control and both of its modes in visible text (OPT-03)", async () => {
    // A switch labelled only by `aria-label` reads as an unlabelled rectangle:
    // it states neither what it is nor which way it sits. Both segments carry
    // their own text, and the group carries the control's name.
    const user = userEvent.setup();
    render(<OptionsLayout>{null}</OptionsLayout>);

    const group = screen.getByRole("radiogroup", { name: "Data" });
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "EOD" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    await user.click(within(group).getByRole("radio", { name: "Live" }));
    expect(within(group).getByRole("radio", { name: "Live" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("announces the mode switch rather than silently swapping tables (OPT-04)", async () => {
    const user = userEvent.setup();
    render(<OptionsLayout>{null}</OptionsLayout>);
    await user.click(screen.getByRole("radio", { name: "Live" }));
    expect(
      screen.getAllByRole("status").some((s) => /live data/i.test(s.textContent ?? ""))
    ).toBe(true);
  });

  it("gives the health tooltip a real accessible name (OPT-14)", () => {
    render(<OptionsLayout>{null}</OptionsLayout>);
    expect(screen.getByRole("button", { name: /what does this status mean/i })).toBeInTheDocument();
  });
});
