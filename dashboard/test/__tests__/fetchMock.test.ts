import { describe, it, expect } from "vitest";
import { mockFetchJson } from "@/test/fetchMock";

describe("mockFetchJson", () => {
  it("resolves canned JSON for a matching URL", async () => {
    mockFetchJson({ "/api/argus/options/live/SPY": { symbol: "SPY", spot: 565 } });
    const res = await fetch("/api/argus/options/live/SPY");
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ symbol: "SPY", spot: 565 });
  });

  it("returns 404 for a URL with no canned response", async () => {
    mockFetchJson({});
    const res = await fetch("/api/unmocked");
    expect(res.status).toBe(404);
  });
});
