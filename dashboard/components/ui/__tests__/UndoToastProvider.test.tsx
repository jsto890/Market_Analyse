import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import UndoToastProvider, { useUndoAction } from "@/components/ui/UndoToastProvider";

function Trigger({ onError, undo }: { onError: () => void; undo: () => void }) {
  const { run } = useUndoAction();
  return (
    <button
      type="button"
      onClick={() =>
        run({
          label: "Removed AAPL from watchlist",
          commit: () => Promise.resolve(),
          onError,
          undo,
        })
      }
    >
      Unpin
    </button>
  );
}

describe("UndoToastProvider", () => {
  it("throws when useUndoAction is used outside the provider", () => {
    function Bare() {
      useUndoAction();
      return null;
    }
    expect(() => render(<Bare />)).toThrow("useUndoAction must be used within UndoToastProvider");
  });

  it("shows the toast label after run() and calls commit immediately", async () => {
    const commit = vi.fn(() => Promise.resolve());
    function T() {
      const { run } = useUndoAction();
      return (
        <button onClick={() => run({ label: "Removed AAPL from watchlist", commit, onError: () => {}, undo: () => {} })}>
          Unpin
        </button>
      );
    }
    render(
      <UndoToastProvider>
        <T />
      </UndoToastProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "Unpin" }));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Removed AAPL from watchlist")).toBeInTheDocument();
  });

  it("calls undo and dismisses the toast when Undo is clicked", async () => {
    const undo = vi.fn();
    render(
      <UndoToastProvider>
        <Trigger onError={() => {}} undo={undo} />
      </UndoToastProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "Unpin" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Removed AAPL from watchlist")).not.toBeInTheDocument();
  });

  it("calls onError when commit rejects", async () => {
    const onError = vi.fn();
    function T() {
      const { run } = useUndoAction();
      return (
        <button
          onClick={() =>
            run({ label: "Removed AAPL from watchlist", commit: () => Promise.reject(new Error("boom")), onError, undo: () => {} })
          }
        >
          Unpin
        </button>
      );
    }
    render(
      <UndoToastProvider>
        <T />
      </UndoToastProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "Unpin" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });
});
