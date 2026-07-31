import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { resetLocalStorage } from "@/test/localStorage";
import Collapsible from "@/components/ui/Collapsible";

describe("Collapsible", () => {
  beforeEach(() => resetLocalStorage());

  it("starts closed by default and toggles aria-expanded on click", async () => {
    render(
      <Collapsible trigger="Sector rotation">
        <div>body content</div>
      </Collapsible>
    );
    const trigger = screen.getByRole("button", { name: "Sector rotation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("honors defaultOpen", () => {
    render(
      <Collapsible trigger="Open by default" defaultOpen>
        <div>body</div>
      </Collapsible>
    );
    expect(screen.getByRole("button", { name: "Open by default" })).toHaveAttribute("aria-expanded", "true");
  });

  it("links trigger aria-controls to the content div's id", () => {
    render(
      <Collapsible trigger="Linked">
        <div>body</div>
      </Collapsible>
    );
    const trigger = screen.getByRole("button", { name: "Linked" });
    const controlsId = trigger.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId as string)).not.toBeNull();
  });

  it("persists open state to dash:collapsible:{persistKey} and restores it on remount", async () => {
    const { unmount } = render(
      <Collapsible trigger="Persisted" persistKey="rotation">
        <div>body</div>
      </Collapsible>
    );
    await userEvent.click(screen.getByRole("button", { name: "Persisted" }));
    expect(localStorage.getItem("dash:collapsible:rotation")).toBe("true");
    unmount();

    render(
      <Collapsible trigger="Persisted" persistKey="rotation">
        <div>body</div>
      </Collapsible>
    );
    expect(await screen.findByRole("button", { name: "Persisted", expanded: true })).toBeInTheDocument();
  });

  it("disables the trigger and renders disabledReason as visible text when disabled", async () => {
    render(
      <Collapsible trigger="Locked" disabled disabledReason="No detail available yet">
        <div>body</div>
      </Collapsible>
    );
    const trigger = screen.getByRole("button", { name: "Locked" });
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveAttribute("title");
    expect(screen.getByText("No detail available yet")).toBeInTheDocument();
    expect(trigger.getAttribute("aria-describedby")).toBe(
      screen.getByText("No detail available yet").id
    );
  });

  it("does not toggle when disabled", async () => {
    render(
      <Collapsible trigger="Locked" disabled disabledReason="No detail available yet">
        <div>body</div>
      </Collapsible>
    );
    const trigger = screen.getByRole("button", { name: "Locked" });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
