import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
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
  it("states the plan once and leaves the levels to the chart that draws them (TK-02)", async () => {
    render(<LevelsCard ticker="AAPL" bridgeRow={bridgeRow()} />);
    await waitFor(() => expect(screen.getByText(/Invalidates on a close below/)).toBeInTheDocument());
    // The rail and the four-cell grid were the same three numbers a third and a
    // fourth time; the chart's titled price lines are the one display.
    expect(screen.queryByTestId("price-rail")).not.toBeInTheDocument();
    expect(screen.queryByText("Entry")).not.toBeInTheDocument();
    expect(screen.queryByText("Target")).not.toBeInTheDocument();
    // Once each, inside the sentence.
    expect(screen.getAllByText("100.00")).toHaveLength(1);
    expect(screen.getAllByText("115.00")).toHaveLength(1);
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
