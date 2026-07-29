import { test, expect } from "@playwright/test";

test("/macro is reachable", async ({ page }) => {
  const res = await page.goto("/macro");
  expect(res?.status()).toBe(200);
});
