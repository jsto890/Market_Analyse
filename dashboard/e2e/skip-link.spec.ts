import { test, expect } from "@playwright/test";

test("skip link moves focus past the rails straight to main content (G-11, A11Y-05)", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
