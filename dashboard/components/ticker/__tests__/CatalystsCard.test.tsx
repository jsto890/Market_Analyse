import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { makeBridgeRow } from "@/test/factories";
import CatalystsCard from "@/components/ticker/CatalystsCard";

const catalysts = {
  next_earnings: "2026-08-02",
  last_earnings: { date: "2026-05-28", surprise_pct: 4.1, reaction_pct: 7.8 },
  analyst: [{ date: "2026-07-23", firm: "Morgan Stanley", to: "Overweight", action: "up" }],
};

describe("CatalystsCard (K-13)", () => {
  it("links out to the calendar from the card header, with the out-of-card arrow", async () => {
    mockFetchJson({ "/api/argus/catalysts/AAPL": catalysts });
    render(<CatalystsCard ticker="AAPL" bridgeRow={makeBridgeRow({ ticker: "AAPL" })} />);
    const link = await screen.findByRole("link", { name: "Calendar →" });
    expect(link).toHaveAttribute("href", "/calendar");
  });

  it("keeps the dated facts the header does not carry, in a fixed time column", async () => {
    mockFetchJson({ "/api/argus/catalysts/AAPL": catalysts });
    render(<CatalystsCard ticker="AAPL" bridgeRow={makeBridgeRow({ ticker: "AAPL" })} />);

    // Last earnings and its price reaction, and the latest analyst action —
    // both left the page when the strip under the header went.
    const when = await screen.findByText("28 May");
    expect(when.className).toContain("w-[58px]");
    expect(screen.getByText("+7.8%")).toBeInTheDocument();
    expect(screen.getByText("23 July")).toBeInTheDocument();
    expect(screen.getByText(/Morgan Stanley ↑ Overweight/)).toBeInTheDocument();
  });

  it("does not restate the earnings countdown the header owns", async () => {
    mockFetchJson({ "/api/argus/catalysts/AAPL": catalysts });
    render(<CatalystsCard ticker="AAPL" bridgeRow={makeBridgeRow({ ticker: "AAPL" })} />);
    await screen.findByText("28 May");
    expect(screen.queryByText(/Earnings (today|tomorrow|in )/)).not.toBeInTheDocument();
  });

  it("renders no dated block at all when the feed carries neither fact", async () => {
    mockFetchJson({
      "/api/argus/catalysts/AAPL": { next_earnings: null, last_earnings: null, analyst: [] },
    });
    render(<CatalystsCard ticker="AAPL" bridgeRow={makeBridgeRow({ ticker: "AAPL" })} />);
    await screen.findByRole("link", { name: "Calendar →" });
    expect(screen.queryByText("28 May")).not.toBeInTheDocument();
  });
});
