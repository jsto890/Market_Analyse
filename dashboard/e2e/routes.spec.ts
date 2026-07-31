import { test, expect } from "@playwright/test";

test("/macro is reachable", async ({ page }) => {
  const res = await page.goto("/macro");
  expect(res?.status()).toBe(200);
});

test("/sources is reachable", async ({ page }) => {
  const res = await page.goto("/sources");
  expect(res?.status()).toBe(200);
});

test("OL-01: /api/argus/options/live/:symbol should not 404, proxied to Argus", async ({ request }) => {
  const res = await request.get("/api/argus/options/live/SPY?expiry=0DTE");
  expect(res.status()).not.toBe(404);
});
