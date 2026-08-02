import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent, fireEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage } from "@/test/localStorage";
import ScreenerPage from "@/app/screener/page";
import UndoToastProvider from "@/components/ui/UndoToastProvider";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function row(symbol: string, score: number, extra: Record<string, unknown> = {}) {
  return {
    symbol, verdict: "LONG", score, high_conviction: false, entry: 1, stop: 1, target: 1,
    risk_reward: 2.1, long_votes: 40, short_votes: 5, wait_votes: 2, agreement_pct: 85.1,
    ret_1d: null, ret_5d: null, ret_20d: null, is_extended: false, entry_quality: "good",
    ...extra,
  };
}

describe("ScreenerPage full-universe GET path (SC-01)", () => {
  it("asks Argus for the unfiltered set so the cutoff can filter locally", async () => {
    mockFetchJson((url: string) => {
      if (url.startsWith("/api/argus/screener")) {
        return { results: [], as_of: "2026-07-30T00:00:00Z", cached: false };
      }
      if (url === "/api/watchlist") {
        return { watchlist: [] };
      }
      return { error: "not mocked", url };
    });

    render(<ScreenerPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));

    await screen.findByText("0 of 0 above 0.30");

    const fetchMock = vi.mocked(fetch);
    const call = fetchMock.mock.calls.find(([input]) =>
      typeof input === "string" && input.startsWith("/api/argus/screener")
    );
    expect(call).toBeDefined();
    const url = call![0] as string;
    expect(url).toContain("min_conviction=0");
  });
});

describe("ScreenerPage idle state (SC-02)", () => {
  it("does not render a shimmering skeleton before any run has happened", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    await screen.findByText("Rank long candidates with the agent ensemble");
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});

describe("ScreenerPage control styling (SC-09)", () => {
  it("Run button has no solid accent fill and inputs have no focus:outline-none", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    const runBtn = await screen.findByRole("button", { name: "Run" });
    expect(runBtn.className).not.toContain("bg-accent text-white");
    const tickerInput = screen.getByPlaceholderText("Filter tickers — AAPL, TSLA, NVDA…");
    expect(tickerInput.className).not.toContain("outline-none");
  });
});

describe("ScreenerPage verdict badge (SC-04)", () => {
  it("renders verdict through Badge, not raw colored text", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0": {
        results: [
          { symbol: "NVDA", verdict: "LONG", score: 0.812, high_conviction: true, entry: 1, stop: 1, target: 1,
            risk_reward: 2.1, long_votes: 40, short_votes: 5, wait_votes: 2, agreement_pct: 85.1,
            ret_1d: 0.024, ret_5d: 0.081, ret_20d: null, is_extended: false, entry_quality: "good" },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      },
    });
    render(
      <UndoToastProvider>
        <ScreenerPage />
      </UndoToastProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    await screen.findByText("NVDA");
    const badge = screen.getByText("Long");
    expect(badge).toHaveAttribute("data-value", "LONG");
    expect(badge.className).toContain("bg-model");
    expect(badge.className).not.toMatch(/(bg|text)-(pos|neg)\b/);
  });
});

describe("ScreenerPage pin toggle (SC-08)", () => {
  it("pinning a row shows the shared undo toast", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0": {
        results: [
          { symbol: "NVDA", verdict: "LONG", score: 0.812, high_conviction: true, entry: 1, stop: 1, target: 1,
            risk_reward: 2.1, long_votes: 40, short_votes: 5, wait_votes: 2, agreement_pct: 85.1,
            ret_1d: 0.024, ret_5d: 0.081, ret_20d: null, is_extended: false, entry_quality: "good" },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      },
    });
    const user = userEvent.setup();
    render(
      <UndoToastProvider>
        <ScreenerPage />
      </UndoToastProvider>
    );
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    await screen.findByText("NVDA");
    await user.click(screen.getByRole("button", { name: "Pin NVDA" }));
    expect(await screen.findByText("Added NVDA to watchlist")).toBeInTheDocument();
  });
});

describe("ScreenerPage header tooltips (SC-05)", () => {
  it("Votes/HC/Agree%/R:R headers expose an info tooltip trigger", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0": {
        // Six names, so the tail spills past the five cards into the table.
        results: ["NVDA", "AMD", "AVGO", "MU", "SMCI", "ARM"].map((s, i) => row(s, 0.8 - i * 0.05)),
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      },
    });
    render(
      <UndoToastProvider>
        <ScreenerPage />
      </UndoToastProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    await screen.findByText("ARM");
    // Each header is a `Gloss` — the term itself is the visible trigger, so the
    // accessible name is the term, not a separate sr-only info button.
    for (const term of ["Votes", "Agree%", "HC", "R:R"]) {
      expect(screen.getByRole("button", { name: term })).toBeInTheDocument();
    }
    // One bar in place of three vote columns.
    expect(screen.queryByRole("columnheader", { name: "L" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "40 long, 5 short, 2 wait" }).length).toBeGreaterThan(0);
  });
});

describe("ScreenerPage return formatting (SC-06)", () => {
  it("renders ret_1d/ret_5d via the shared pct() formatter output", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0": {
        results: [
          { symbol: "NVDA", verdict: "LONG", score: 0.812, high_conviction: false, entry: 1, stop: 1, target: 1,
            risk_reward: 2.1, long_votes: 1, short_votes: 0, wait_votes: 0, agreement_pct: 100,
            ret_1d: 0.024, ret_5d: -0.081, ret_20d: null, is_extended: false, entry_quality: "good" },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: false,
      },
    });
    render(
      <UndoToastProvider>
        <ScreenerPage />
      </UndoToastProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    expect(await screen.findByText("+2.4%")).toBeInTheDocument();
    expect(screen.getByText("-8.1%")).toBeInTheDocument();
  });
});

describe("ScreenerPage always-visible refresh (SC-07)", () => {
  it("shows a refresh button even when the result was not cached", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0": {
        results: [],
        as_of: "2026-07-28T00:00:00Z",
        cached: false,
      },
    });
    render(<ScreenerPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    expect(await screen.findByRole("button", { name: /re-run/i })).toBeInTheDocument();
  });
});

describe("ScreenerPage result cards and cutoff slider (SC-10)", () => {
  const scores = [0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35];
  const seven = ["NVDA", "AMD", "AVGO", "MU", "SMCI", "ARM", "TSM"].map((s, i) => row(s, scores[i]));

  function mount() {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0": {
        results: seven,
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      },
    });
    return render(
      <UndoToastProvider>
        <ScreenerPage />
      </UndoToastProvider>
    );
  }

  it("leads with the top five as cards and puts only the tail in the table", async () => {
    resetLocalStorage();
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    await screen.findByText("TSM");
    // The five cards link out; the rest are table rows under one caption.
    expect(screen.getByRole("link", { name: "NVDA" })).toHaveAttribute("href", "/t/NVDA");
    expect(screen.queryByRole("link", { name: "ARM" })).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: /below the top five/i });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("lifts the top-ranked card and lets the rest recede (O-09)", async () => {
    resetLocalStorage();
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    await screen.findByText("TSM");
    const card = (t: string) =>
      screen.getByRole("link", { name: t }).closest("div.rounded-md")!.className;
    expect(card("NVDA")).toContain("border-line-strong");
    expect(card("NVDA")).toContain("bg-elevated");
    expect(card("AMD")).toContain("bg-surface");
    expect(card("AMD")).not.toContain("bg-elevated");
  });

  it("says how many names the cutoff keeps, and drops them as it is raised", async () => {
    resetLocalStorage();
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    expect(await screen.findByText("7 of 7 above 0.30")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Min score"), { target: { value: "0.55" } });
    expect(await screen.findByText("3 of 7 above 0.55")).toBeInTheDocument();
    expect(screen.queryByText("MU")).not.toBeInTheDocument();
  });

  it("keeps a named screen and re-runs it on click", async () => {
    resetLocalStorage();
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Filter tickers — AAPL, TSLA, NVDA…"), "NVDA, AMD");
    await user.click(screen.getByRole("button", { name: "Save screen" }));
    await user.type(screen.getByLabelText("Name this screen"), "Semis{Enter}");

    const saved = screen.getByRole("button", { name: "Semis" });
    expect(saved).toBeInTheDocument();
    // Reloading the page finds it again — a screen you named is not session state.
    expect(window.localStorage.getItem("dash:screener:screens")).toContain("Semis");

    await user.click(saved);
    const posted = vi.mocked(fetch).mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
    expect(JSON.parse((posted![1] as RequestInit).body as string).universe).toEqual(["NVDA", "AMD"]);
  });
});

describe("ScreenerPage persistence + cancel (SC-03)", () => {
  it("restores the last result from localStorage on mount", async () => {
    resetLocalStorage();
    window.localStorage.setItem(
      "dash:screener:last-result",
      JSON.stringify({
        results: [
          { symbol: "AMD", verdict: "LONG", score: 0.5, high_conviction: false, entry: 1, stop: 1, target: 1,
            risk_reward: 1.5, long_votes: 1, short_votes: 0, wait_votes: 0, agreement_pct: 90,
            ret_1d: null, ret_5d: null, ret_20d: null, is_extended: false, entry_quality: "ok" },
        ],
        as_of: "2026-07-27T00:00:00Z",
        cached: true,
      })
    );
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(
      <UndoToastProvider>
        <ScreenerPage />
      </UndoToastProvider>
    );
    expect(await screen.findByText("AMD")).toBeInTheDocument();
  });

  it("shows a Cancel button while a run is in flight", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<ScreenerPage />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
