// dashboard/scripts/row-heights.mjs — measures Today-table row heights; exits 1 on slivers
import { chromium } from "playwright";

const URL = process.env.SMOKE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });

const rows = await page.$$eval("tbody tr", (els) =>
  els.map((el) => ({
    h: Math.round(el.getBoundingClientRect().height),
    text: (el.textContent ?? "").trim().slice(0, 40),
  }))
);
if (rows.length === 0) {
  console.log("no rows rendered — cannot verify row heights (is BRIDGE_DIR set / bridge_latest.csv present?)");
  await browser.close();
  process.exit(1);
}
// A "sliver" is any row that participates in layout but is too short to be a real
// data row (data rows are ~33-39px). Phantom collapsed expansion rows render as a
// 1px-tall <tr> with EMPTY text, so we must NOT require text — that was the original
// bug (B3): empty 1px expansion rows interleaved between data rows.
const slivers = rows.filter((r) => r.h > 0 && r.h < 16);
console.log(`rows=${rows.length} slivers=${slivers.length}`);
for (const s of slivers) console.log(`  h=${s.h}px  "${s.text || "(empty)"}"`);
await browser.close();
process.exit(slivers.length > 0 ? 1 : 0);
