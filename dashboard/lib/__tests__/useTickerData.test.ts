// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { useTickerData } from "@/lib/useTickerData";

function Probe({ ticker }: { ticker: string }) {
  const { quote, actionCard, fundamentals } = useTickerData(ticker);
  return React.createElement(
    "div",
    null,
    React.createElement("span", null, "quote:", quote.data ? quote.data.price : "…"),
    React.createElement("span", null, "verdict:", actionCard.data ? actionCard.data.verdict : "…"),
    React.createElement("span", null, "name:", fundamentals.data ? fundamentals.data.name : "…")
  );
}

describe("useTickerData", () => {
  it("fetches quote, action_card, and fundamentals for a ticker (TK-18)", async () => {
    mockFetchJson({
      "/api/argus/quote/NVDA": { symbol: "NVDA", price: 120.5, change: 1.2, change_pct: 1.0 },
      "/api/argus/action_card/NVDA": {
        symbol: "NVDA",
        verdict: "LONG",
        score: 0.6,
        high_conviction: false,
        entry: 118,
        stop: 110,
        target: 135,
        risk_reward: 2.1,
        long_votes: 8,
        short_votes: 1,
        wait_votes: 1,
        agreement_pct: 80,
        ret_1d: null,
        ret_5d: null,
        ret_20d: null,
        is_extended: false,
        entry_quality: "",
        votes: [],
        agreed: [],
        dissented: [],
        notes: "",
      },
      "/api/argus/fundamentals/NVDA": { symbol: "NVDA", name: "NVIDIA Corp" },
    });
    render(React.createElement(Probe, { ticker: "NVDA" }));
    expect(await screen.findByText("quote:120.5")).toBeInTheDocument();
    expect(await screen.findByText("verdict:LONG")).toBeInTheDocument();
    expect(await screen.findByText("name:NVIDIA Corp")).toBeInTheDocument();
  });
});
