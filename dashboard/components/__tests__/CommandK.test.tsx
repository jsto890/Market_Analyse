import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage } from "@/test/localStorage";
import CommandK from "@/components/CommandK";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  resetLocalStorage();
  push.mockClear();
});

it("labels a bridge match using the canonical GROUP_LABEL wording (tech+fund, not tech_fund)", async () => {
  mockFetchJson({
    "/api/bridge": {
      signals: [
        { ticker: "AAPL", group1: false, group2: true, conviction: "low", sentiment_score: 0.5, action_label: "WATCH" },
      ],
    },
    "/api/watchlist": { watchlist: [] },
  });

  render(<CommandK />);
  window.dispatchEvent(new Event("commandk:open"));
  const input = await screen.findByPlaceholderText("Search ticker…");
  (input as HTMLInputElement).focus();
  await new Promise((r) => setTimeout(r, 15));

  const { default: userEvent } = await import("@testing-library/user-event");
  await userEvent.type(input, "AAPL");

  await waitFor(() => expect(screen.getByText("tech+fund")).toBeInTheDocument());
});

it("does not open on a bare 'g' keypress while typing in an unrelated text field (G-03)", async () => {
  mockFetchJson({
    "/api/bridge": { signals: [] },
    "/api/watchlist": { watchlist: [] },
  });

  document.body.innerHTML = '<textarea id="scratch"></textarea>';
  const scratch = document.getElementById("scratch") as HTMLTextAreaElement;

  render(<CommandK />);
  expect(screen.queryByPlaceholderText("Search ticker…")).not.toBeInTheDocument();

  scratch.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
  await waitFor(() => {});

  expect(screen.queryByPlaceholderText("Search ticker…")).not.toBeInTheDocument();
});

it("shows recent tickers and action commands with an empty query (G-04 default state)", async () => {
  window.localStorage.setItem("dash:commandk:recent", JSON.stringify(["NVDA"]));
  mockFetchJson({
    "/api/bridge": { signals: [] },
    "/api/watchlist": { watchlist: [] },
  });

  render(<CommandK />);
  window.dispatchEvent(new Event("commandk:open"));

  await screen.findByText("NVDA");
  expect(screen.getByText("recent")).toBeInTheDocument();
  expect(screen.getByText("Go to Watchlist")).toBeInTheDocument();
  expect(screen.getByText("Go to Macro")).toBeInTheDocument();
});

it("selecting an action command navigates to its route, not a /t/ ticker route (G-04)", async () => {
  mockFetchJson({
    "/api/bridge": { signals: [] },
    "/api/watchlist": { watchlist: [] },
  });

  render(<CommandK />);
  window.dispatchEvent(new Event("commandk:open"));

  const action = await screen.findByText("Go to Watchlist");
  const { default: userEvent } = await import("@testing-library/user-event");
  await userEvent.click(action);

  expect(push).toHaveBeenCalledWith("/watchlist");
  expect(push).not.toHaveBeenCalledWith(expect.stringMatching(/^\/t\//));
});
