import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import AiPanel from "@/components/ticker/AiPanel";

beforeEach(() => {
  let call = 0;
  global.fetch = vi.fn(async () => {
    call += 1;
    return {
      ok: true,
      json: async () => ({ mode: "test", report: `report v${call}\n\nsecond paragraph` }),
    } as Response;
  });
});

describe("AiPanel", () => {
  it("renders the report as paragraphs, not a <pre>", async () => {
    const user = userEvent.setup();
    render(<AiPanel ticker="AAPL" />);
    await user.click(screen.getByText(/Generate analysis/));
    await waitFor(() => expect(screen.getByText("report v1")).toBeInTheDocument());
    expect(screen.getByText("second paragraph")).toBeInTheDocument();
    expect(document.querySelector("pre")).toBeNull();
  });

  it("Regenerate re-fetches after a report is already loaded", async () => {
    const user = userEvent.setup();
    render(<AiPanel ticker="AAPL" />);
    await user.click(screen.getByText(/Generate analysis/));
    await waitFor(() => expect(screen.getByText("report v1")).toBeInTheDocument());

    await user.click(screen.getByText("Regenerate"));
    await waitFor(() => expect(screen.getByText("report v2")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("Copy writes the report text to the clipboard", async () => {
    const user = userEvent.setup();
    // userEvent.setup() attaches its own real Clipboard stub to navigator.clipboard
    // (Clipboard is not implemented by jsdom); spy on that stub rather than
    // replacing navigator.clipboard ourselves, since userEvent re-attaches it.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<AiPanel ticker="AAPL" />);
    await user.click(screen.getByText(/Generate analysis/));
    await waitFor(() => expect(screen.getByText("report v1")).toBeInTheDocument());

    await user.click(screen.getByText("Copy"));
    expect(writeText).toHaveBeenCalledWith("report v1\n\nsecond paragraph");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
