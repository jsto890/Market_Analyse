import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchHistory } from "@/lib/history";

afterEach(() => vi.unstubAllGlobals());

function respond(impl: () => Promise<Response> | Promise<never>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("fetchHistory", () => {
  it("returns the bars when Argus has them", async () => {
    const bars = [{ time: "2026-08-01", open: 1, high: 2, low: 0.5, close: 1.5 }];
    respond(async () => new Response(JSON.stringify({ bars })));
    expect(await fetchHistory("AAPL")).toEqual({ status: "ok", bars });
  });

  it("separates an empty chart from a broken one", async () => {
    // A listed symbol Argus has no history for is not a failure, and the page
    // says so differently — hence four states rather than bars-or-null.
    respond(async () => new Response(JSON.stringify({ bars: [] })));
    expect(await fetchHistory("AAPL")).toEqual({ status: "no-data" });

    respond(async () => new Response(JSON.stringify({})));
    expect(await fetchHistory("AAPL")).toEqual({ status: "no-data" });
  });

  it("reports a slow Argus as a timeout, not an error", async () => {
    respond(async () => {
      const e = new Error("aborted");
      e.name = "TimeoutError";
      throw e;
    });
    expect(await fetchHistory("AAPL")).toEqual({ status: "timeout" });
  });

  it("reports a non-200 and a dead socket as errors", async () => {
    respond(async () => new Response("nope", { status: 500 }));
    expect(await fetchHistory("AAPL")).toEqual({ status: "error" });

    respond(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchHistory("AAPL")).toEqual({ status: "error" });
  });

  it("encodes the symbol into the path", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: RequestInfo | URL) => {
        urls.push(String(u));
        return new Response(JSON.stringify({ bars: [] }));
      })
    );
    await fetchHistory("BRK/B");
    expect(urls[0]).toContain("/api/history/BRK%2FB");
  });
});
