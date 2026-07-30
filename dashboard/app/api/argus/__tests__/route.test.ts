import { describe, it, expect, vi, afterEach } from "vitest";

describe("Argus proxy PATCH passthrough (AL-01)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards PATCH with a JSON body to the Argus API and returns its response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("http://127.0.0.1:8088/api/alerts/rules/7");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(init!.body as string)).toEqual({ enabled: false });
        return new Response(JSON.stringify({ id: 7, enabled: false }), { status: 200 });
      })
    );
    const { PATCH } = await import("../[...path]/route");
    const req = new Request("http://localhost/api/argus/alerts/rules/7", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    const res = await PATCH(req, { params: { path: ["alerts", "rules", "7"] } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ id: 7, enabled: false });
  });
});
