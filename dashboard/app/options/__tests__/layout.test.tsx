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

  it("names the live control and its state in visible text (OPT-03)", async () => {
    const user = userEvent.setup();
    render(<OptionsLayout>{null}</OptionsLayout>);

    expect(screen.getByText("Live ladder")).toBeInTheDocument();
    expect(screen.getByText("off")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: /live ladder/i }));
    expect(screen.getByText("on")).toBeInTheDocument();
  });

  it("announces the mode switch rather than silently swapping tables (OPT-04)", async () => {
    const user = userEvent.setup();
    render(<OptionsLayout>{null}</OptionsLayout>);
    await user.click(screen.getByRole("switch", { name: /live ladder/i }));
    expect(
      screen.getAllByRole("status").some((s) => /live ladder on/i.test(s.textContent ?? ""))
    ).toBe(true);
  });

  it("gives the health tooltip a real accessible name (OPT-14)", () => {
    render(<OptionsLayout>{null}</OptionsLayout>);
    expect(screen.getByRole("button", { name: /what does this status mean/i })).toBeInTheDocument();
  });
});
