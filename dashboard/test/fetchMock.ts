import { vi } from "vitest";

type FetchResponses = Record<string, unknown> | ((url: string) => unknown);

export function mockFetchJson(responses: FetchResponses) {
  const resolve = typeof responses === "function" ? responses : (url: string) => responses[url];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = resolve(url);
      if (body === undefined) {
        return new Response(JSON.stringify({ error: "not mocked", url }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );
}
