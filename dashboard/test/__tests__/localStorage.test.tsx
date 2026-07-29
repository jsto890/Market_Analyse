import { describe, it, expect } from "vitest";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { render, screen, userEvent } from "@/test/render";
import { resetLocalStorage, seedLocalStorage } from "@/test/localStorage";

function Toggle({ storageKey }: { storageKey: string }) {
  const [on, setOn] = useLocalStorage<boolean>(storageKey, false);
  return (
    <button aria-pressed={on} onClick={() => setOn(!on)}>
      {on ? "on" : "off"}
    </button>
  );
}

describe("localStorage test helpers", () => {
  it("resetLocalStorage clears state seeded by a previous test", async () => {
    seedLocalStorage("toggle:panel", true);
    render(<Toggle storageKey="toggle:panel" />);
    expect(await screen.findByRole("button", { name: "on" })).toBeInTheDocument();

    resetLocalStorage();
    render(<Toggle storageKey="toggle:panel" />);
    expect(await screen.findByRole("button", { name: "off" })).toBeInTheDocument();
  });

  it("persists writes made through useLocalStorage", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    render(<Toggle storageKey="toggle:live" />);

    await user.click(screen.getByRole("button", { name: "off" }));

    expect(screen.getByRole("button", { name: "on" })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("toggle:live")).toBe("true");
  });
});
