import { describe, it, expect, vi, beforeEach } from "vitest";
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
