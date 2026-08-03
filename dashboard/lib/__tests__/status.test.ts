import { describe, it, expect, vi, afterEach } from "vitest";
import { mockFetchJson } from "@/test/fetchMock";
import { worstOf, classifyAge, buildStatus } from "../status";

describe("worstOf", () => {
  it("down beats everything", () => expect(worstOf(["ok", "down", "idle"])).toBe("down"));
  it("warn beats idle and ok", () => expect(worstOf(["idle", "warn", "ok"])).toBe("warn"));
  it("all ok", () => expect(worstOf(["ok", "ok"])).toBe("ok"));
  it("idle beats ok (visible but muted)", () => expect(worstOf(["ok", "idle"])).toBe("idle"));
  it("empty -> ok", () => expect(worstOf([])).toBe("ok"));
});

describe("classifyAge", () => {
  const opts = { warnAfter: 24, downAfter: 48, marketClosedNow: false };
  it("fresh -> ok", () => expect(classifyAge(2, opts)).toBe("ok"));
  it("stale -> warn", () => expect(classifyAge(30, opts)).toBe("warn"));
  it("dead -> down", () => expect(classifyAge(50, opts)).toBe("down"));
  it("weekend staleness -> idle not red", () =>
    expect(classifyAge(50, { ...opts, marketClosedNow: true })).toBe("idle"));
  it("weekend mild staleness -> idle", () =>
    expect(classifyAge(30, { ...opts, marketClosedNow: true })).toBe("idle"));
});

// ---------------------------------------------------------------------------
// buildStatus itself. The helpers above were covered; the branch that decides
// what the IBKR row says — the one the last commit changed — was not.
// ---------------------------------------------------------------------------

const ARGUS = "http://127.0.0.1:8088/health";
const ODTE = "http://127.0.0.1:8788/health";
const CAL = "http://127.0.0.1:8088/api/calendar?days=1";

function health(argus: unknown, odte: unknown) {
  mockFetchJson((url: string) =>
    url === ARGUS ? argus : url === ODTE ? odte : url === CAL ? { events: [] } : undefined
  );
}

async function ibkrRow(argus: unknown, odte: unknown) {
  health(argus, odte);
  const s = await buildStatus();
  return s.services.find((x) => x.name === "ibkr")!;
}

describe("buildStatus — the IBKR row", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prefers odte's completed handshake over the port probe", async () => {
    // A socket can be listening while the Gateway behind it refuses to talk, so
    // a finished handshake outranks a probe that only saw the socket.
    const row = await ibkrRow({ ibkr: { port: 4002, listening: false } }, { ibkr_connected: true });
    expect(row.state).toBe("ok");
    expect(row.detail).toContain("4002");
  });

  it("falls back to the port probe when odte is not running", async () => {
    const row = await ibkrRow({ ibkr: { port: 7496, listening: true } }, null);
    expect(row.state).toBe("ok");
    expect(row.detail).toContain("7496");
  });

  it("warns rather than alarms when Argus reports no port at all", async () => {
    // Nothing was measured, so neither "up" nor "down" would be honest.
    expect((await ibkrRow({}, null)).state).toBe("warn");
  });

  it("names the real port in the failure message rather than guessing one", async () => {
    const row = await ibkrRow({ ibkr: { port: 4002, listening: false } }, null);
    expect(row.detail).toContain("4002");
    expect(["down", "idle"]).toContain(row.state);
  });

  it("marks argus down, and the whole dashboard with it, when 8088 is unreachable", async () => {
    health(null, null);
    const s = await buildStatus();
    expect(s.services.find((x) => x.name === "argus")!.state).toBe("down");
    expect(s.aggregate).toBe("down");
  });
});
