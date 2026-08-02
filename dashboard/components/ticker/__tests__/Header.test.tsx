import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import Header from "@/components/ticker/Header";
import type { BridgeRow } from "@/types/bridge";

function bridgeRow(overrides: Partial<BridgeRow> = {}): BridgeRow {
  return {
    ticker: "NVDA",
    action_label: "PRIME_LONG",
    argus_verdict: "LONG",
    trade_style: "MOMENTUM",
    conviction: "high",
    high_conviction: true,
    argus_score: 0.74,
    agreement_pct: 81,
    earnings_in_days: null,
    ...overrides,
  } as unknown as BridgeRow;
}

/** ISO date `d` days from today, UTC — the basis the header counts on. */
function isoIn(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

beforeEach(() => {
  mockFetchJson(() => ({}));
});

describe("Header badge row (TK-04)", () => {
  it("shows one consolidated badge (tier), not three separate badges", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(screen.getByText("Prime long")).toBeInTheDocument();
    expect(screen.queryByText("Long")).not.toBeInTheDocument();
    expect(screen.queryByText("MOMENTUM")).not.toBeInTheDocument();
  });

  it("falls back to the verdict badge for SHORT, which the tier scale has no color for", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow({ action_label: "AVOID", argus_verdict: "SHORT", trade_style: "MOMENTUM" })}
        signalHistory={[]}
        lastClose={null}
      />
    );
    expect(screen.getByText("Short")).toBeInTheDocument();
    expect(screen.queryByText("Avoid")).not.toBeInTheDocument();
  });

  it("renders the tier as display copy, keeping the raw enum on data-value (TH-02)", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow({ action_label: "STANDARD_LONG" })} signalHistory={[]} lastClose={null} />);
    const badge = screen.getByText("Standard long");
    expect(badge).toHaveAttribute("data-value", "STANDARD_LONG");
    expect(badge).not.toHaveAttribute("title");
    expect(screen.queryByText("STANDARD_LONG")).not.toBeInTheDocument();
  });
});

describe("Header is one three-band card (K-01, K-06)", () => {
  it("owns its own card element, so the page no longer wraps it in a section", () => {
    const { container } = render(
      <Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />
    );
    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(1);
    const card = sections[0];
    expect(card).toBe(container.firstElementChild);
    expect(card.className).toContain("rounded-lg");
    expect(card.className).toContain("border-line-strong");
    expect(card.className).toContain("bg-surface");
  });

  it("lays the zone row out on fixed widths rather than a wrapping flex row", () => {
    const { container } = render(
      <Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />
    );
    const zones = container.querySelector('[class*="grid-cols-[1fr_320px_300px]"]');
    expect(zones).not.toBeNull();
    // Below 1100px it becomes one column — never two rows of zones.
    expect(zones!.className).toContain("max-[1100px]:grid-cols-1");
  });

  it("puts the verbs and the earnings chip in one band of their own (K-06)", async () => {
    mockFetchJson({
      "/api/argus/catalysts/NVDA": { next_earnings: isoIn(0), last_earnings: null, analyst: [] },
    });
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    const chip = await screen.findByText("Earnings today");
    const band = chip.parentElement!;
    expect(band).toContainElement(screen.getByRole("link", { name: "Alert" }));
    expect(band.className).toContain("bg-elevated");
    // The bar no longer floats to the end of whichever row it landed in.
    expect(screen.getByRole("link", { name: "Alert" }).parentElement!.className).not.toContain(
      "ml-auto"
    );
  });

  it("renders the earnings phrase alone — the catalysts feed carries no session word", async () => {
    mockFetchJson({
      "/api/argus/catalysts/NVDA": { next_earnings: isoIn(0), last_earnings: null, analyst: [] },
    });
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(await screen.findByText("Earnings today")).toBeInTheDocument();
    expect(screen.queryByText(/after close|BMO|AMC/)).not.toBeInTheDocument();
  });
});

describe("Header glossary and prices (TH-01, TH-04, K-02, K-03)", () => {
  it("moves the HC glossary off the page body onto the chip that needs it (TH-01)", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(screen.queryByText(/consensus, not edge/i)).not.toBeInTheDocument();
    // A Gloss, not a hover tooltip: the chip itself is the focusable trigger.
    fireEvent.click(screen.getByRole("button", { name: "HC" }));
    expect(screen.getByRole("note")).toHaveTextContent(/consensus, not edge/i);
  });

  it("prices the call off the same number it prints, and names its basis (TH-04)", async () => {
    mockFetchJson({ "/api/argus/quote/NVDA": { symbol: "NVDA", price: 110, change: 1, change_pct: 1 } });
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: "2026-07-01", report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={90}
      />
    );
    expect(await screen.findByText("live")).toBeInTheDocument();
    // +10% off the live 110, not -10% off the stale 90 close.
    expect(screen.getByText(/\+10\.0%/)).toBeInTheDocument();
  });

  it("falls back to the last close and says so when there is no quote (TH-04)", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: "2026-07-01", report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={90}
      />
    );
    expect(screen.getByText("last close")).toBeInTheDocument();
  });

  it("prints the price at display size with both the percent and the absolute move (K-02)", async () => {
    mockFetchJson({
      "/api/argus/quote/NVDA": { symbol: "NVDA", price: 333.43, change: -4.77, change_pct: -1.41 },
    });
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    const price = await screen.findByText("333.43");
    expect(price.className).toContain("text-display");
    const pct = screen.getByText("-1.41%");
    expect(pct.className).toContain("text-title");
    expect(pct.className).toContain("text-neg");
    const abs = screen.getByText("-4.77");
    expect(abs.className).toContain("text-data");
  });

  it("draws the day range as a bar positioned inside its own bar (K-03)", () => {
    const { container } = render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[]}
        lastClose={148.2}
        dayHigh={151.9}
        dayLow={146.4}
      />
    );
    expect(screen.getByText("146.40")).toBeInTheDocument();
    expect(screen.getByText("day range")).toBeInTheDocument();
    expect(screen.getByText("151.90")).toBeInTheDocument();
    // (148.2 - 146.4) / (151.9 - 146.4) = 32.727…%
    const marker = container.querySelector<HTMLElement>('[style*="left"]');
    expect(marker).not.toBeNull();
    expect(marker!.style.left.startsWith("32.7")).toBe(true);
  });

  it("renders no day range when there are no bars to take one from", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(screen.queryByText("day range")).not.toBeInTheDocument();
  });

  it("draws the volume bar against ADV (K-03)", async () => {
    mockFetchJson({
      "/api/argus/quote/NVDA": { symbol: "NVDA", price: 150, change: 1, change_pct: 1 },
      "/api/argus/fundamentals/NVDA": {
        symbol: "NVDA",
        name: "NVIDIA Corp",
        volume: 300_000_000,
        avg_volume: 200_000_000,
      },
    });
    const { container } = render(
      <Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />
    );
    expect(await screen.findByText("Vol 300.0M")).toBeInTheDocument();
    expect(screen.getByText("1.50× ADV")).toBeInTheDocument();
    // The fill is capped at the track: 1.5× ADV is a full bar, not 150% of one.
    const fill = container.querySelector<HTMLElement>('[style*="width"]');
    expect(fill!.style.width).toBe("100%");
  });

  it("renders no volume line at all when the feed carries no ADV", async () => {
    mockFetchJson({
      "/api/argus/quote/NVDA": { symbol: "NVDA", price: 150, change: 1, change_pct: 1 },
      "/api/argus/fundamentals/NVDA": { symbol: "NVDA", name: "NVIDIA Corp", volume: 300_000_000 },
    });
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(await screen.findByText("NVIDIA Corp")).toBeInTheDocument();
    expect(screen.queryByText(/Vol /)).not.toBeInTheDocument();
    expect(screen.queryByText(/× ADV/)).not.toBeInTheDocument();
  });

  it("leaves the 52-week range to the chart info strip (K-03)", async () => {
    mockFetchJson({
      "/api/argus/quote/NVDA": { symbol: "NVDA", price: 150, change: 1, change_pct: 1 },
      "/api/argus/fundamentals/NVDA": {
        symbol: "NVDA",
        name: "NVIDIA Corp",
        week52_high: 200,
        week52_low: 100,
      },
    });
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[]}
        lastClose={null}
      />
    );
    expect(await screen.findByText("NVIDIA Corp")).toBeInTheDocument();
    expect(screen.queryByText(/52w/)).not.toBeInTheDocument();
    expect(screen.queryByText(/of range/)).not.toBeInTheDocument();
  });
});

describe("Header verdict zone (K-04)", () => {
  it("states the score and the agreement behind it, in model tone", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow({ argus_score: 0.74, agreement_pct: 81 })}
        signalHistory={[]}
        lastClose={null}
      />
    );
    const line = screen.getByText(/score 0\.74/);
    expect(line.className).toContain("text-model");
    expect(line).toHaveTextContent("score 0.74 · agreement 81%");
  });

  it("reads an agreement written as a fraction as the same percentage", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow({ argus_score: 0.74, agreement_pct: 0.81 })}
        signalHistory={[]}
        lastClose={null}
      />
    );
    expect(screen.getByText(/score 0\.74/)).toHaveTextContent("agreement 81%");
  });

  it("says what the score is not, with the glossary beside it", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(screen.getByText(/Model output, not a return forecast\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "What HC means →" }));
    expect(screen.getByRole("note")).toHaveTextContent(/consensus, not edge/i);
  });

  it("no longer carries earnings — that fact belongs to the action band (K-06)", async () => {
    mockFetchJson({
      "/api/argus/catalysts/NVDA": { next_earnings: isoIn(0), last_earnings: null, analyst: [] },
    });
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    const chip = await screen.findByText("Earnings today");
    const verdictZone = screen.getByText("Prime long").closest("div")!.parentElement!;
    expect(verdictZone).not.toContainElement(chip);
  });
});

describe("Header track record (K-05)", () => {
  it("splits this call from the cohort base rate into columns, not stacked lines", () => {
    const { container } = render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: isoIn(-3), report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={110}
        medianPeakPct={20}
        medianDaysToPeak={7}
      />
    );
    const eyebrows = Array.from(container.querySelectorAll(".eyebrow")).map((e) => e.textContent);
    expect(eyebrows).toEqual(["This call", "Cohort", "Read"]);
    const band = container.querySelector(".grid-cols-3");
    expect(band).not.toBeNull();
    expect(band!.className).toContain("border-t");
  });

  it("keeps every figure the stacked lines carried", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: isoIn(-3), report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={110}
        medianPeakPct={20}
        medianDaysToPeak={7}
      />
    );
    expect(screen.getByText(/@ 100\.00 → 110\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\+10\.0%/)).toHaveTextContent("+10.0% in 3 days");
    expect(screen.getByText("median pick peaks +20%")).toBeInTheDocument();
    expect(screen.getByText("at ~7 days")).toBeInTheDocument();
  });

  it("states the comparison between the call and its cohort rather than leaving it to the reader (TH-09)", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: isoIn(-3), report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={110}
        medianPeakPct={20}
        medianDaysToPeak={7}
      />
    );
    // +10% against a +20% median peak, on day 3 of a ~7-day window.
    expect(screen.getByText(/50% of the cohort's median peak, ~4d of that window left\./)).toBeInTheDocument();
  });

  it("reads a call that has run past the cohort's peak and out of its window", () => {
    render(
      <Header
        ticker="NVDA"
        bridgeRow={bridgeRow()}
        signalHistory={[{ date: isoIn(-30), report_group: null, action_label: null, combined_score: null, entry: 100 }]}
        lastClose={140}
        medianPeakPct={20}
        medianDaysToPeak={7}
      />
    );
    expect(screen.getByText(/Past the cohort's median peak, past that window\./)).toBeInTheDocument();
  });
});

describe("Header earnings and identity (TH-03, K-11)", () => {
  it("counts down from the catalysts date, the same source the strip read (TH-03)", async () => {
    const date = isoIn(1);
    mockFetchJson({
      "/api/argus/catalysts/NVDA": { next_earnings: date, last_earnings: null, analyst: [] },
    });
    render(
      <Header ticker="NVDA" bridgeRow={bridgeRow({ earnings_in_days: 9 } as Partial<BridgeRow>)} signalHistory={[]} lastClose={null} />
    );
    expect(await screen.findByText("Earnings tomorrow")).toBeInTheDocument();
    expect(screen.queryByText("Earnings in 9d")).not.toBeInTheDocument();
  });

  it("sets the company name on the symbol's baseline and the meta line in sans (K-11)", async () => {
    mockFetchJson({
      "/api/argus/fundamentals/NVDA": {
        symbol: "NVDA",
        name: "NVIDIA Corp",
        sector: "Technology",
        industry: "Semiconductors",
        market_cap: 3_400_000_000_000,
      },
    });
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    const name = await screen.findByText("NVIDIA Corp");
    expect(name.className).toContain("text-title");
    expect(name.className).toContain("text-3");
    // Same baseline as the symbol, so they share a row.
    expect(name.parentElement).toContainElement(screen.getByText("NVDA"));

    const sector = screen.getByText("Technology");
    const industry = screen.getByText("Semiconductors");
    // One tone for all three facts, and no "mkt cap" label on the cap.
    const metaLine = sector.closest("p")!;
    expect(metaLine.className).toContain("text-label");
    expect(metaLine.className).toContain("text-muted");
    expect(metaLine.className).not.toContain("font-mono");
    expect(industry.className).not.toContain("text-muted-2");
    expect(screen.getByText("$3.4T").className).toContain("font-mono");
    expect(screen.queryByText(/mkt cap/)).not.toBeInTheDocument();
  });

  it("carries five verbs, each with a destination (TH-07)", () => {
    render(<Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />);
    expect(screen.getByRole("link", { name: "Alert" })).toHaveAttribute("href", "/alerts?symbol=NVDA");
    expect(screen.getByRole("link", { name: "Options" })).toHaveAttribute("href", "#options");
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/screener?symbols=NVDA"
    );
    expect(screen.getByRole("button", { name: "Copy NVDA" })).toBeInTheDocument();
  });
});
