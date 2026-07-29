import { test, expect } from "@playwright/test";

test("/macro is reachable", async ({ page }) => {
  const res = await page.goto("/macro");
  expect(res?.status()).toBe(200);
});

test("/sources currently 404s (baseline — see MARKET_ANALYSE_UI_AUDIT.md)", async ({ page }) => {
  const res = await page.goto("/sources");
  expect(res?.status()).toBe(404);
});

test("OL-01: /api/options/live/:symbol should not 404 once proxied to Argus", async ({ request }) => {
  test.fail(
    true,
    "Expected-red until OL-01 is fixed: add app/api/options/live/[symbol]/route.ts " +
      "(or point fetchOptionsLive at /api/argus/options/live/:symbol). " +
      "Delete this test.fail() call once fixed — the assertion below must then hold."
  );
  const res = await request.get("/api/options/live/SPY?expiry=0DTE");
  expect(res.status()).not.toBe(404);
});
