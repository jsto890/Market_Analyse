import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:3210";
const OUT = "/tmp/ma_shots";
const errors = [];

const browser = await chromium.launch({
  executablePath:
    process.env.HOME +
    "/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) =>
  errors.push(`[reqfail] ${r.url()} — ${r.failure()?.errorText}`)
);

async function visit(path, name, actions) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 }).catch((e) => {
    errors.push(`[nav ${path}] ${e.message}`);
    return null;
  });
  await page.waitForTimeout(1500);
  if (actions) await actions().catch((e) => errors.push(`[actions ${name}] ${e.message}`));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const status = res ? res.status() : "ERR";
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 120).replace(/\n/g, " ");
  console.log(`${name}: HTTP ${status} — "${bodyText}…"`);
}

await visit("/", "01-today");
await visit("/odte", "02-odte", async () => {
  // expand the first verdict card if clickable
  const card = page.locator("[class*='border-l'], button, [role='button']").first();
  await card.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
});
await visit("/odte/strikes", "03-strikes", async () => {
  const tabs = page.getByRole("button").filter({ hasText: /\d{2}-\d{2}|Jul|expiry/i });
  const n = await tabs.count().catch(() => 0);
  if (n > 1) await tabs.nth(1).click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
});
await visit("/watchlist", "04-watchlist");
await visit("/rotation", "05-rotation");
await visit("/screener", "06-screener");

// interact with the ODTE underlying selector to test persistence
await page.goto(BASE + "/odte", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(800);
const selBtns = page.getByText(/^QQQ$/).first();
await selBtns.click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/07-odte-qqq.png`, fullPage: true });
const persisted = await page.evaluate(() => localStorage.getItem("odte-symbol"));
console.log(`odte-symbol persisted: ${persisted}`);

console.log("\n=== ERRORS (" + errors.length + ") ===");
for (const e of [...new Set(errors)]) console.log(e);
await browser.close();
