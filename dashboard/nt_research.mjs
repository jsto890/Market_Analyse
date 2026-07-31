import { chromium } from "playwright-core";
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
p.on("pageerror", e => console.log("[pageerror]", e.message));

await p.goto("http://127.0.0.1:3097/t/AAPL", { waitUntil: "networkidle", timeout: 30000 });
await p.waitForTimeout(3500);
// find AI generate button
const btns = await p.evaluate(() => Array.from(document.querySelectorAll("button")).map(x=>x.innerText.trim()).filter(Boolean));
console.log("BUTTONS:", JSON.stringify(btns));
try {
  const el = p.locator("button", { hasText: /Generate/i }).first();
  await el.scrollIntoViewIfNeeded();
  await el.click({ timeout: 4000 });
  console.log("clicked generate");
  await p.waitForTimeout(14000);
} catch(e){ console.log("gen err", e.message); }
// dump AI section text
const t = await p.evaluate(() => document.body.innerText);
const idx = t.indexOf("\nAI\n");
console.log("=== AI SECTION ===");
console.log(idx>=0 ? t.slice(idx, idx+2500) : "AI marker not found");
await b.close();
