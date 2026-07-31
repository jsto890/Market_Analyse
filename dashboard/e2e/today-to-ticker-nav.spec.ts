import { test, expect } from "@playwright/test";

test("opening a ticker from a Today group table enables prev/next scoped to that group", async ({ page }) => {
  await page.goto("/");
  const firstGroupPanel = page.locator("table").first();
  // Off the href, not the cell text — the cell also carries the NEW marker.
  const href = await firstGroupPanel.locator("tbody tr").first().locator("a[href^='/t/']").first().getAttribute("href");

  await firstGroupPanel.locator("tbody tr").first().click();
  await expect(page).toHaveURL(new RegExp(`${href}$`, "i"));

  const breadcrumb = page.getByRole("navigation", { name: "Ticker breadcrumb" });
  await expect(breadcrumb.getByText("Today")).toBeVisible();
  const nextLink = page.getByLabel(/^Next:/);
  if (await nextLink.count()) {
    await expect(nextLink).toBeVisible();
  }
});

test("visiting a ticker page directly (no Today session state) shows a breadcrumb only", async ({ page }) => {
  await page.goto("/t/AAPL");
  await expect(page.getByRole("navigation", { name: "Ticker breadcrumb" }).getByText("Today")).toBeVisible();
  await expect(page.getByLabel(/^Previous:/)).toHaveCount(0);
  await expect(page.getByLabel(/^Next:/)).toHaveCount(0);
});
