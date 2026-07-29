import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import ContextStrip from "@/components/ContextStrip";

describe("ContextStrip SYS pill", () => {
  it("is real button, closed default, opened on click — not hover-only (G-06)", async () => {
    mockFetchJson({
      "/api/status": {
        aggregate: "ok",
        services: [{ name: "bridge", state: "ok", detail: "fresh" }],
        bridgeTime: null,
      },
    });

    render(<ContextStrip />);
    const trigger = await screen.findByRole("button", { name: "System status" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("bridge")).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("bridge")).toBeInTheDocument();
  });
});
