import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import UndoToastProvider from "@/components/ui/UndoToastProvider";
import Header from "@/components/ticker/Header";
import { makeBridgeRow } from "@/test/factories";

function withProvider(ui: React.ReactNode) {
  return <UndoToastProvider>{ui}</UndoToastProvider>;
}

describe("Header", () => {
  it("renders a PinToggle labelled with the ticker symbol", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/quote/NVDA": { symbol: "NVDA", price: 142.3, change: 1.2, change_pct: 0.85 },
      "/api/argus/fundamentals/NVDA": { name: "NVIDIA" },
    });

    render(
      withProvider(
        <Header
          ticker="NVDA"
          bridgeRow={makeBridgeRow({ ticker: "NVDA" })}
          signalHistory={[]}
          lastClose={142.3}
        />
      )
    );

    expect(await screen.findByRole("button", { name: "Pin NVDA" })).toBeInTheDocument();
  });
});
