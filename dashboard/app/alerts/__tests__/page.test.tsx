import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import UndoToastProvider from "@/components/ui/UndoToastProvider";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

import AlertsPage from "../page";

function baseMocks(overrides: Record<string, unknown> = {}) {
  return {
    "/api/argus/alerts/rules": {
      rules: [
        { id: 1, kind: "verdict", symbol: "NVDA", params: { target: "LONG" }, note: null, enabled: true, last_fired_ts: null },
      ],
    },
    "/api/argus/alerts/log?limit=30": { items: [] },
    ...overrides,
  };
}

describe("AlertsPage enable/disable toggle (AL-01)", () => {
  it("renders a Toggle per rule and PATCHes on change", async () => {
    let patchedBody: unknown = null;
    const realFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH") {
        patchedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: 1, enabled: false }), { status: 200 });
      }
      const mocks = baseMocks() as Record<string, unknown>;
      return new Response(JSON.stringify(mocks[url] ?? {}), { status: 200 });
    }) as typeof fetch;

    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    const toggle = await screen.findByRole("switch", { name: "Enable verdict alert for NVDA" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    const user = userEvent.setup();
    await user.click(toggle);
    expect(patchedBody).toEqual({ enabled: false });

    global.fetch = realFetch;
  });
});

describe("AlertsPage channel status (AL-02)", () => {
  it("shows configured/unconfigured state per channel and sends a test alert", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/channels": { email: true, telegram: false, webhook: true },
      "/api/argus/alert": { ok: true },
    });
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    await screen.findByText("Email ✓");
    expect(screen.getByText("Telegram —")).toBeInTheDocument();
    expect(screen.getByText("Webhook ✓")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Send test" }));
    expect(await screen.findByText(/Test alert sent/)).toBeInTheDocument();
  });
});

describe("AlertsPage validation (AL-03)", () => {
  it("disables Add for an incomplete price rule and surfaces a server error", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/rules:POST": { error: "symbol not recognized" },
    });
    const user = userEvent.setup();
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    await user.selectOptions(screen.getByLabelText("Condition"), "price");
    await user.type(screen.getByLabelText("Symbol"), "ZZZZ");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(screen.getByLabelText("Level"), "200");
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });
});

describe("AlertsPage delete undo (AL-04)", () => {
  it("shows an undo toast after deleting a rule, and Undo restores it", async () => {
    mockFetchJson(baseMocks());
    const user = userEvent.setup();
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    await screen.findByText("NVDA → Verdict flips to LONG");
    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    expect(await screen.findByText("Removed NVDA verdict alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("NVDA → Verdict flips to LONG")).toBeInTheDocument();
  });
});

describe("AlertsPage evaluate-now result (AL-05)", () => {
  it("shows a result summary after evaluating, even if nothing fired", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/evaluate": { fired: [] },
    });
    const user = userEvent.setup();
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    await screen.findByText("NVDA → Verdict flips to LONG");
    await user.click(screen.getByRole("button", { name: "Evaluate now" }));
    expect(await screen.findByText(/Evaluated 1 rule · 0 fired/)).toBeInTheDocument();
  });
});

describe("AlertsPage condition phrasing (AL-06)", () => {
  it("uses the same condition phrase in the chip and the row summary", async () => {
    mockFetchJson(baseMocks());
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    expect(await screen.findByText("Verdict flips to")).toBeInTheDocument();
    expect(screen.getByText("NVDA → Verdict flips to LONG")).toBeInTheDocument();
  });
});

describe("AlertsPage log grouping + timezone label (AL-07)", () => {
  it("groups log items under a day header and labels timestamps as local time", async () => {
    const ts = "2026-07-28T14:00:00Z";
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/log?limit=30": {
        items: [{ id: 1, ts, title: "NVDA verdict → LONG", body: "score 0.8" }],
      },
    });
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    await screen.findByText("NVDA verdict → LONG");
    expect(screen.getByText("Showing latest 30")).toBeInTheDocument();
    expect(screen.getByText(/\(local time\)/)).toBeInTheDocument();
    // Day header must match the runner's local calendar date for `ts`, not
    // its UTC date — timezone-explicit so this holds regardless of TZ.
    const expectedDay = new Date(ts).toLocaleDateString("en-CA");
    expect(screen.getByText(expectedDay)).toBeInTheDocument();
  });
});

describe("AlertsPage form primitives (AL-08)", () => {
  it("uses shared Input/Select for the new-alert form, no hardcoded inputCls fields", async () => {
    mockFetchJson(baseMocks());
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    const symbolInput = await screen.findByPlaceholderText("NVDA");
    expect(symbolInput.className).toContain("h-8");
    expect(symbolInput.className).not.toContain("h-9");
  });
});
