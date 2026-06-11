#!/usr/bin/env node
/**
 * smoke.mjs — dashboard smoke test
 * Usage: node scripts/smoke.mjs
 * Requires dev server running (or starts one). Base URL: SMOKE_URL env var or http://localhost:3000
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = path.resolve(__dirname, "..");
const SMOKE_DIR = path.join(DASHBOARD_DIR, ".smoke");

// Routes to visit
const ROUTES = [
  { path: "/", label: "home", expandRow: true },
  { path: "/t/AMD", label: "ticker-AMD" },
  { path: "/t/SPY", label: "ticker-SPY" },
  { path: "/watchlist", label: "watchlist" },
  { path: "/performance", label: "performance" },
  { path: "/sources", label: "sources" },
  { path: "/screener", label: "screener" },
  { path: "/portfolio", label: "portfolio" },
];

// API path prefixes that are acceptable to fail (IBKR offline, quote 404s)
const ACCEPTABLE_FAIL_PREFIXES = [
  "/api/argus/portfolio",
  "/api/argus/flow",
  "/api/argus/fundamentals",
  "/api/argus/quote",
  "/api/argus/screener",
  "/api/argus/history",
];

// Next.js dev-server static chunks that may 404 transiently during warmup
// are detected by URL pattern rather than prefix list.
function isNextStaticChunk(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/_next/static/");
  } catch {
    return false;
  }
}

function isAcceptableFail(url) {
  try {
    const u = new URL(url);
    return ACCEPTABLE_FAIL_PREFIXES.some((p) => u.pathname.startsWith(p));
  } catch {
    return false;
  }
}

function isCriticalFail(url, status) {
  if (status < 400) return false;
  // _next/static chunks may transiently 404 during dev warmup — not critical
  if (isNextStaticChunk(url)) return false;
  // page-document failures are always critical
  if (!url.includes("/api/")) return true;
  return !isAcceptableFail(url);
}

async function detectServer(baseUrl) {
  try {
    const resp = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    return resp.status < 600;
  } catch {
    return false;
  }
}

async function waitForServer(baseUrl, maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await detectServer(baseUrl)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  const baseUrl = process.env.SMOKE_URL ?? "http://localhost:3000";

  // Prepare screenshot dir
  if (!fs.existsSync(SMOKE_DIR)) fs.mkdirSync(SMOKE_DIR, { recursive: true });

  // Start dev server if needed
  let devProc = null;
  const serverAlive = await detectServer(baseUrl);

  if (!serverAlive) {
    // Try port 3001 in case 3000 is taken
    const alt = baseUrl.replace(":3000", ":3001");
    const altAlive = alt !== baseUrl && (await detectServer(alt));
    if (altAlive) {
      console.log(`[smoke] Dev server found on ${alt}`);
      process.env.SMOKE_URL = alt;
      return main(); // re-enter with updated URL
    }

    console.log("[smoke] Starting dev server (npm run dev)…");
    devProc = spawn("npm", ["run", "dev"], {
      cwd: DASHBOARD_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
    devProc.stdout.on("data", () => {});
    devProc.stderr.on("data", () => {});

    const ready = await waitForServer(baseUrl);
    if (!ready) {
      console.error("[smoke] Dev server did not start within 60s");
      devProc.kill();
      process.exit(1);
    }
    console.log("[smoke] Dev server ready — warming up routes…");
    // Next.js dev compiles routes lazily. Pre-fetch each route to trigger
    // compilation before the browser test runs.
    await Promise.allSettled(
      ROUTES.map(async (r) => {
        try {
          await fetch(`${baseUrl}${r.path}`, { signal: AbortSignal.timeout(25000) });
        } catch {
          // ignore
        }
      })
    );
    // Extra wait for Webpack to finish compiling static chunks
    await new Promise((res) => setTimeout(res, 5000));
  } else {
    console.log(`[smoke] Using existing server at ${baseUrl}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const results = [];

  for (const route of ROUTES) {
    const url = `${baseUrl}${route.path}`;
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const acceptableFailedRequests = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (resp) => {
      const status = resp.status();
      const respUrl = resp.url();
      if (isCriticalFail(respUrl, status)) {
        failedRequests.push({ url: respUrl, status });
      } else if (status >= 400 && isAcceptableFail(respUrl)) {
        acceptableFailedRequests.push({ url: respUrl, status });
      }
    });

    let navError = null;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    } catch (e) {
      navError = e.message;
    }

    // For home route: try clicking first table row to expand it
    if (route.expandRow && !navError) {
      try {
        const firstRow = page.locator("tbody tr").first();
        await firstRow.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        const screenshotPath = path.join(SMOKE_DIR, `${route.label}-expanded.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      } catch {
        // No rows or click failed — not a failure, just a no-op
      }
    }

    const screenshotPath = path.join(SMOKE_DIR, `${route.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.close();

    // Console errors from "Failed to load resource" are correlated with response
    // events. If the only console errors are resource-load failures and all
    // critical failed requests are zero, those console messages come from
    // acceptable API failures (argus/IBKR offline). Filter them out.
    const nonResourceConsoleErrors = consoleErrors.filter(
      (e) => !e.startsWith("Failed to load resource")
    );

    const passed =
      !navError &&
      nonResourceConsoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      failedRequests.length === 0;

    results.push({
      route: route.path,
      label: route.label,
      passed,
      navError,
      consoleErrors,
      pageErrors,
      failedRequests,
      acceptableFailedRequests,
      screenshot: screenshotPath,
    });
  }

  await browser.close();
  if (devProc) devProc.kill();

  // Print summary
  const width = 60;
  console.log("\n" + "=".repeat(width));
  console.log("SMOKE TEST SUMMARY");
  console.log("=".repeat(width));

  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    console.log(`\n[${status}] ${r.route}`);
    if (r.navError) console.log(`  nav error: ${r.navError}`);
    const nonResourceCE = r.consoleErrors.filter(
      (e) => !e.startsWith("Failed to load resource")
    );
    const resourceCE = r.consoleErrors.filter((e) =>
      e.startsWith("Failed to load resource")
    );
    if (nonResourceCE.length > 0) {
      console.log(`  console errors (${nonResourceCE.length}):`);
      nonResourceCE.forEach((e) => console.log(`    - ${e}`));
    }
    if (resourceCE.length > 0) {
      console.log(
        `  resource 404/5xx (acceptable — ${resourceCE.length}, from argus/IBKR APIs):`
      );
      resourceCE.forEach((e) => console.log(`    ~ ${e}`));
    }
    if (r.pageErrors.length > 0) {
      console.log(`  page errors (${r.pageErrors.length}):`);
      r.pageErrors.forEach((e) => console.log(`    - ${e}`));
    }
    if (r.failedRequests.length > 0) {
      console.log(`  failed requests (${r.failedRequests.length}):`);
      r.failedRequests.forEach(({ url, status }) => console.log(`    - ${status} ${url}`));
    }
    if (r.acceptableFailedRequests.length > 0) {
      console.log(
        `  acceptable failures — argus/IBKR offline (${r.acceptableFailedRequests.length}):`
      );
      r.acceptableFailedRequests.forEach(({ url, status }) =>
        console.log(`    ~ ${status} ${url}`)
      );
    }
    if (r.passed) {
      console.log(`  screenshot: ${r.screenshot}`);
    }
    if (!r.passed) allPassed = false;
  }

  console.log("\n" + "=".repeat(width));
  const passCount = results.filter((r) => r.passed).length;
  console.log(`${passCount}/${results.length} routes passed`);
  console.log("=".repeat(width) + "\n");

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("[smoke] Fatal:", err);
  process.exit(1);
});
