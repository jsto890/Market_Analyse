// Reusable page-capture helper for product testing.
// Usage: node scripts/shot.mjs <path> <out-name> [clickTextA,clickTextB,...]
//   node scripts/shot.mjs /odte 02-odte "QQQ,Levels"
// Screenshots to /tmp/ma_shots/<out-name>.png, prints console/page/network
// errors and the first 400 chars of visible text. Clicks are best-effort
// (by visible text, in order) with a screenshot after each.
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:3210";
const OUT = "/tmp/ma_shots";
const [, , path = "/", name = "shot", clicksArg = ""] = process.argv;
const clicks = clicksArg ? clicksArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
const errors = [];

const exe =
  process.env.HOME +
  "/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({ executablePath: exe });
const [vw, vh] = (process.env.VIEWPORT || "1440x900").split("x").map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on("console", (m) => m.type() === "error" && errors.push(`[console] ${m.text()}`));
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("response", (r) => {
  // Only real endpoints, ignore Next RSC prefetch aborts (?_rsc=).
  if (r.status() >= 500 && !r.url().includes("_rsc=")) errors.push(`[${r.status()}] ${r.url()}`);
});

await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 25000 }).catch((e) =>
  errors.push(`[nav] ${e.message}`)
);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

let i = 0;
for (const t of clicks) {
  i++;
  const target = page.getByText(new RegExp(`^${t}`, "i")).first();
  await target.click({ timeout: 3000 }).catch((e) => errors.push(`[click ${t}] ${e.message}`));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}-click${i}.png`, fullPage: true });
}

const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 400).replace(/\n/g, " ");
console.log(`PATH ${path}  ->  ${name}.png`);
console.log(`TEXT: ${text}`);
console.log(`ERRORS (${[...new Set(errors)].length}):`);
for (const e of [...new Set(errors)]) console.log("  " + e);
await browser.close();
