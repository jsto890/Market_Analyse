import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import Contributors from "@/components/macro/Contributors";

const PAYLOAD = {
  scope: "global",
  window: "1d",
  n: 412,
  score: 0.31,
  tickers: [],
  items: [
    {
      headline: "Fed holds rates, signals one cut",
      ticker: null,
      source: "Bloomberg",
      url: "https://example.test/a",
      ts: "2026-08-03T09:18:00Z",
      score: 0.82,
      weight: 1.0,
      share: 0.12,
    },
  ],
};

function mock(payload: unknown = PAYLOAD) {
  mockFetchJson((url: string) =>
    url.startsWith("/api/argus/macro/contributors") ? payload : {}
  );
}

const expectedClock = new Date("2026-08-03T09:18:00Z").toLocaleTimeString("en-AU", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

describe("Contributors (MAC-09 restack)", () => {
  it("prints each item's weight, clock and source under the headline", async () => {
    mock();
    render(<Contributors scope="global" window="1d" />);
    expect(await screen.findByText(/weight 1\.00/)).toBeInTheDocument();
    expect(screen.getByText(expectedClock)).toBeInTheDocument();
    expect(screen.getByText("Bloomberg")).toBeInTheDocument();
  });

  it("omits the source separator when an item carries no source (no-feed rule)", async () => {
    mock({
      ...PAYLOAD,
      items: [{ ...PAYLOAD.items[0], source: null }],
    });
    render(<Contributors scope="global" window="1d" />);
    await screen.findByText(/weight 1\.00/);
    expect(screen.queryByText("Bloomberg")).not.toBeInTheDocument();
  });

  it("states the scored headline count but never links to an all-articles route", async () => {
    mock();
    render(<Contributors scope="global" window="1d" />);
    expect(await screen.findByText(/412 scored headlines/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /all 412/i })).not.toBeInTheDocument();
  });
});
