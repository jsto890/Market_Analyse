import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage, seedLocalStorage } from "@/test/localStorage";
import { makeBridgeRow } from "@/test/factories";
import LevelsCard from "@/components/ticker/LevelsCard";
import type { BridgeRow } from "@/types/bridge";

function bridgeRow(overrides: Partial<BridgeRow> = {}): BridgeRow {
  return makeBridgeRow({
    ticker: "AAPL",
    action_label: "LONG",
    entry: 100,
    stop: 95,
    target: 115,
    risk_reward: 3,
    ...overrides,
  });
}

beforeEach(() => {
  resetLocalStorage();
  mockFetchJson({
    "/api/argus/quote/AAPL": { price: 102.5 },
    "/api/argus/action_card/AAPL": {},
  });
});

describe("LevelsCard", () => {
  it("shows the rail's visible low/high scale and live price label", async () => {
    render(<LevelsCard ticker="AAPL" bridgeRow={bridgeRow()} />);
    const rail = await waitFor(() => screen.getByTestId("price-rail"));
    expect(within(rail).getByText("95.00")).toBeInTheDocument();
    expect(within(rail).getByText("115.00")).toBeInTheDocument();
    expect(within(rail).getByText("102.50")).toBeInTheDocument();
  });

  it("frames risk sizing as % of a stated account size with a fee/slippage caveat", async () => {
    const user = userEvent.setup();
    render(<LevelsCard ticker="AAPL" bridgeRow={bridgeRow()} />);
    await waitFor(() => expect(screen.getByLabelText("Account $")).toBeInTheDocument());

    await user.clear(screen.getByLabelText("Account $"));
    await user.type(screen.getByLabelText("Account $"), "20000");
    await user.clear(screen.getByLabelText("Risk %"));
    await user.type(screen.getByLabelText("Risk %"), "2");

    await waitFor(() =>
      expect(screen.getByText(/risking \$400 = 2% \$20,000 account/)).toBeInTheDocument()
    );
    expect(screen.getByText(/No fees or slippage modeled/)).toBeInTheDocument();
  });

  it("reads previously-saved account size and risk % from the registered storage keys", async () => {
    seedLocalStorage("dash:risk:accountSize", 50000);
    seedLocalStorage("dash:risk:pct", 0.5);
    render(<LevelsCard ticker="AAPL" bridgeRow={bridgeRow()} />);
    await waitFor(() =>
      expect(screen.getByText(/risking \$250 = 0.5% \$50,000 account/)).toBeInTheDocument()
    );
  });
});
