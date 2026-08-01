import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import UndoToastProvider from "@/components/ui/UndoToastProvider";
import PinToggle from "@/components/ui/PinToggle";

function withProvider(ui: React.ReactNode) {
  return <UndoToastProvider>{ui}</UndoToastProvider>;
}

describe("PinToggle", () => {
  it("chip variant: shows Pin when the symbol is not on the watchlist", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(withProvider(<PinToggle symbol="AAPL" />));
    expect(await screen.findByRole("button", { name: "Pin AAPL" })).toHaveTextContent("Pin");
  });

  it("chip variant: shows Pinned + aria-pressed=true when the symbol is on the watchlist", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [{ ticker: "AAPL" }] } });
    render(withProvider(<PinToggle symbol="AAPL" />));
    const btn = await screen.findByRole("button", { name: "Unpin AAPL" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveTextContent("Pinned");
  });

  it("optimistically flips to Pinned on click and POSTs to /api/watchlist", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(withProvider(<PinToggle symbol="AAPL" />));
    const btn = await screen.findByRole("button", { name: "Pin AAPL" });
    await userEvent.click(btn);
    expect(await screen.findByRole("button", { name: "Unpin AAPL" })).toHaveAttribute("aria-pressed", "true");
    expect(fetch).toHaveBeenCalledWith(
      "/api/watchlist",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ticker: "AAPL" }) })
    );
  });

  it("shows an undo toast after toggling", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(withProvider(<PinToggle symbol="AAPL" />));
    await userEvent.click(await screen.findByRole("button", { name: "Pin AAPL" }));
    expect(await screen.findByText("Added AAPL to watchlist")).toBeInTheDocument();
  });

  it("text variant: renders an inline Pin/Unpin link with aria-pressed", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(withProvider(<PinToggle symbol="AAPL" variant="text" />));
    // Named with the symbol, not just "Pin": on the watchlist this control sits
    // once per row, and a screen reader reading four identical "Pin" buttons
    // cannot tell you which row it is on.
    const btn = await screen.findByRole("button", { name: "Pin AAPL" });
    expect(btn).toHaveTextContent("Pin");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });
});
