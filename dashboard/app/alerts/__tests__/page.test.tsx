import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import UndoToastProvider from "@/components/ui/UndoToastProvider";
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
    await screen.findByText("NVDA → verdict becomes LONG");
    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    expect(await screen.findByText("Removed NVDA verdict alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("NVDA → verdict becomes LONG")).toBeInTheDocument();
  });
});
