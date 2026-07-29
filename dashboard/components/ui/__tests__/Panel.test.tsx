import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import Panel from "@/components/ui/Panel";

beforeEach(() => resetLocalStorage());

describe("Panel", () => {
  it("renders a plain string title unchanged (backward compat)", () => {
    render(<Panel title="Sector rotation">body</Panel>);
    expect(screen.getByText("Sector rotation")).toBeInTheDocument();
  });

  it("renders a count chip next to the title when count is supplied", () => {
    render(
      <Panel title="Everything else" count={7}>
        body
      </Panel>
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders no count chip when count is omitted", () => {
    render(<Panel title="Sector rotation">body</Panel>);
    expect(screen.queryByText(/^\(/)).not.toBeInTheDocument();
  });

  it("toggles aria-expanded and animates via grid-template-rows, not max-height", async () => {
    render(
      <Panel title="Sector rotation" collapsible defaultOpen={false}>
        <div>body</div>
      </Panel>
    );
    const trigger = screen.getByRole("button", { name: /Sector rotation/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const contentWrapper = screen.getByText("body").closest("div[style]") as HTMLElement;
    expect(contentWrapper.style.gridTemplateRows).toBe("0fr");
    expect(contentWrapper.style.maxHeight).toBe("");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("persists open state to dash:collapsible:{persistKey}, not dash:panel:", async () => {
    render(
      <Panel title="Sector rotation" collapsible persistKey="rotation">
        <div>body</div>
      </Panel>
    );
    await userEvent.click(screen.getByRole("button", { name: /Sector rotation/ }));
    expect(localStorage.getItem("dash:collapsible:rotation")).toBe("true");
    expect(localStorage.getItem("dash:panel:rotation")).toBeNull();
  });

  it("renders actions alongside a collapsible trigger", () => {
    render(
      <Panel title="Sector rotation" collapsible actions={<button>Refresh</button>}>
        body
      </Panel>
    );
    expect(screen.getByRole("button", { name: "Sector rotation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("migrates legacy dash:panel: key to dash:collapsible: on first read (one-time)", () => {
    // Simulate existing persisted state from old Panel.tsx before migration
    localStorage.setItem("dash:panel:rotation", "true");

    render(
      <Panel title="Sector rotation" collapsible persistKey="rotation" defaultOpen={false}>
        <div>body</div>
      </Panel>
    );

    // Should have read the legacy value and opened the panel
    const trigger = screen.getByRole("button", { name: /Sector rotation/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // New key should now have the migrated value
    expect(localStorage.getItem("dash:collapsible:rotation")).toBe("true");

    // Old key should be removed or at least no longer authoritative
    expect(localStorage.getItem("dash:panel:rotation")).toBeNull();
  });
});
