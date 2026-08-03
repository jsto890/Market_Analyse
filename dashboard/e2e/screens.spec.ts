import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Screenshot harness for the UI overhaul review.
 *
 * Run:  npx playwright test e2e/screens.spec.ts
 * Out:  dashboard/screens/*.png
 *
 * Not an assertion suite — it captures pixels. Every "state" capture is
 * wrapped so a stale selector logs a warning instead of aborting the run.
 */

// A capture is three navigations, each paying settle()'s 2.5s beat on top of a
// cold dev-server compile. The config's 30s default is an assertion budget, not
// a capture budget — under it the *last* shot of a test is the one that dies.
test.describe.configure({ timeout: 120_000 });

const OUT = path.join(process.cwd(), "screens");
fs.mkdirSync(OUT, { recursive: true });

const LAPTOP = { width: 1440, height: 900 };
const DESKTOP = { width: 1920, height: 1080 };
/** The audit's own width. It used to inherit Playwright's `Desktop Chrome`
 * default, so every width in `_audit.json` was a 1280 number that nothing in
 * this file declared and a config edit could silently move. Pinned here so the
 * numbers mean something; the review width is `LAPTOP`, which the substrate
 * contract below measures. */
const AUDIT = { width: 1280, height: 720 };

/** Kill animations/transitions and caret blink so captures are deterministic. */
async function freeze(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
      scroll-behavior: auto !important;
    }`,
  });
}

/**
 * RailShell scrolls an inner <div id="main"> inside a
 * h-[calc(100vh-var(--nav-h))] flex row, so Playwright's fullPage:true only
 * ever sees one viewport. This unrolls the inner scroller so the whole page
 * is in the capture. Reverted by the next navigation.
 */
async function unrollScroller(page: Page) {
  await page.addStyleTag({
    content: `
      body > div:has(> #main), div:has(> #main) {
        height: auto !important;
        overflow: visible !important;
      }
      #main {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      /* inner max-height scrollers (ladder, rails) */
      [class*="max-h-[70vh]"], [class*="h-[calc(100vh"] {
        max-height: none !important;
        height: auto !important;
        overflow: visible !important;
      }
    `,
  });
}

/** Best-effort settle: network idle if it comes, then a fixed beat for SWR. */
async function settle(page: Page, ms = 2500) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForLoadState("networkidle", { timeout: 6000 })
    .catch(() => {}); // polling pages (live ladder, 5s health) never go idle
  await page.waitForTimeout(ms);
}

/**
 * Wait until the rails have reached the geometry this route is supposed to have.
 *
 * `LeftRail`/`RightRail` render expanded during SSR and collapse in a `useEffect`
 * keyed on `dense`, to keep hydration clean. So `#main` is viewport−488 until
 * hydration runs and viewport−72 after it — anything that measures width off a
 * fixed timeout is racing that effect and will report the wrong number on a slow
 * machine. Assert the state instead of hoping the settle beat won.
 *
 * `RailShell` opens both rails on `/` alone (`dense = pathname !== "/"`).
 */
async function waitForRails(page: Page, routePath: string) {
  const dense = routePath !== "/";
  await page.waitForFunction(
    (isDense) => {
      const rails = Array.from(document.querySelectorAll<HTMLElement>("#main ~ aside"));
      if (rails.length !== 2) return false;
      const css = getComputedStyle(document.documentElement);
      const px = (name: string) => parseFloat(css.getPropertyValue(name));
      const want = isDense
        ? [px("--rail-collapsed"), px("--rail-collapsed")]
        : [px("--rail-l"), px("--rail-r")];
      // DOM order is left then right; `order-1`/`order-3` only move them visually.
      return rails.every((r, i) => Math.abs(r.getBoundingClientRect().width - want[i]) <= 1);
    },
    dense,
    { timeout: 15_000 },
  );
}

async function shot(page: Page, name: string, opts: { full?: boolean } = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: !!opts.full });
  console.log(`  ✓ ${name}.png`);
}

/** Non-fatal wrapper for interaction-dependent captures. */
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.warn(`  ⚠ skipped ${name}: ${(err as Error).message.split("\n")[0]}`);
  }
}

const ROUTES: { path: string; name: string }[] = [
  { path: "/", name: "today" },
  { path: "/t/AAPL", name: "ticker-aapl" },
  { path: "/odte", name: "options-overview-legacy" },
  { path: "/odte/strikes", name: "options-strikes-legacy" },
  { path: "/options", name: "options-overview" },
  { path: "/options/ladder", name: "options-ladder" },
  { path: "/options/gamma", name: "options-gamma" },
  { path: "/options/flow", name: "options-flow" },
  { path: "/options/greeks", name: "options-greeks" },
  { path: "/calendar", name: "calendar" },
  { path: "/watchlist", name: "watchlist" },
  { path: "/screener", name: "screener" },
  { path: "/portfolio", name: "portfolio" },
  { path: "/alerts", name: "alerts" },
  { path: "/rotation", name: "rotation" },
  { path: "/macro", name: "macro" },
  { path: "/brief", name: "brief" },
  { path: "/learn", name: "learn" },
  { path: "/learn/glossary", name: "learn-glossary" },
  { path: "/learn/options", name: "learn-options" },
  { path: "/learn/data", name: "learn-data" },
];

// ── 1. Every route, both viewports, viewport-height + unrolled full page ─────

test.describe("routes", () => {
  for (const route of ROUTES) {
    test(`capture ${route.name}`, async ({ page }) => {
      // What the user actually sees on a 1440 laptop — the honest first impression.
      await page.setViewportSize(LAPTOP);
      await page.goto(route.path);
      await freeze(page);
      await settle(page);
      await shot(page, `${route.name}--1440-fold`);

      // Whole page, inner scroller unrolled.
      await unrollScroller(page);
      await page.waitForTimeout(400);
      await shot(page, `${route.name}--1440-full`, { full: true });

      // Wide desktop — does the layout use the space or strand it?
      await page.setViewportSize(DESKTOP);
      await page.goto(route.path);
      await freeze(page);
      await settle(page);
      await shot(page, `${route.name}--1920-fold`);
    });
  }
});

// ── 2. States that only exist after interaction ──────────────────────────────

test("state: options strikes — live mode, and scrolled right", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/odte/strikes");
  await freeze(page);
  await settle(page);

  await step("live toggle", async () => {
    // The unlabelled `switch` became the named "Data" segmented control
    // (OPT-03), so live is a radio you select, not a toggle you flip.
    const toggle = page.getByRole("radio", { name: "Live" });
    await toggle.click({ timeout: 5000 });
    await page.waitForTimeout(3000); // let the 500ms poller land a snapshot
    await shot(page, "state--strikes-live-mode");

    // The 23-column table past the sticky Strike column: can you still tell
    // which side (calls vs puts) you are reading?
    // The ladder scrolls on `overflow-x-auto overflow-y-auto`, not the shorthand
    // — match both, and wait with a short timeout so a miss is reported by
    // `step` in seconds rather than eating the whole 120s test budget.
    const scroller = page
      .locator("div.overflow-auto, div.overflow-x-auto")
      .filter({ has: page.locator("table") })
      .first();
    await scroller.waitFor({ state: "attached", timeout: 5000 });
    await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(300);
    await shot(page, "state--strikes-live-scrolled-right");

    await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth / 2; });
    await page.waitForTimeout(300);
    await shot(page, "state--strikes-live-scrolled-mid");
  });

  await step("collapse how-to-read", async () => {
    await page.goto("/odte/strikes");
    await freeze(page);
    await settle(page);
    await page.getByText(/how to read this ladder/i).click({ timeout: 4000 });
    await page.waitForTimeout(300);
    await shot(page, "state--strikes-explainer-collapsed");
  });
});

test("state: ticker page — sticky section rail and lower sections", async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await page.goto("/t/AAPL");
  await freeze(page);
  await settle(page);

  const scroller = page.locator("#main");

  // Scrolled far enough that the rail pins under the global nav and tracks a
  // section — where the old bar printed its labels a second time.
  await step("sticky section rail", async () => {
    await scroller.evaluate((el) => { el.scrollTop = 420; });
    await page.waitForTimeout(400);
    await shot(page, "state--ticker-subnav-sticky");
  });

  await step("deep scroll", async () => {
    await scroller.evaluate((el) => { el.scrollTop = 1400; });
    await page.waitForTimeout(400);
    await shot(page, "state--ticker-scrolled-mid");
  });

  // Narrow: the grid reorders (order-1/order-2) and the anchored sections
  // move above the chart.
  await step("narrow reorder", async () => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/t/AAPL");
    await freeze(page);
    await settle(page);
    await unrollScroller(page);
    await shot(page, "state--ticker-1024-full", { full: true });
  });
});

test("state: today — filters active, and Everything else open", async ({ page }) => {
  // Four full page loads in one test; the 120s default is not enough for it
  // under a loaded dev server.
  test.setTimeout(240_000);
  await page.setViewportSize(LAPTOP);
  await page.goto("/");
  await freeze(page);
  await settle(page);

  await step("HC filter", async () => {
    // The toggle folded into the conviction select (T-12) — same filter, one
    // fewer control on the toolbar row.
    await page
      .getByRole("combobox", { name: "Filter by conviction" })
      .selectOption("hc", { timeout: 4000 });
    await page.waitForTimeout(400);
    await shot(page, "state--today-hc-filter");
  });

  await step("everything else open", async () => {
    await page.getByText(/everything else/i).first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
    await unrollScroller(page);
    await shot(page, "state--today-all-groups-open", { full: true });
  });

  await step("expanded signal row", async () => {
    await page.goto("/");
    await freeze(page);
    await settle(page);
    // Filters persist in localStorage across the steps above, and the table
    // only appears below the top three cards — so clear them and take the
    // fullest group.
    await page.getByRole("button", { name: /clear filters/i }).click({ timeout: 4000 });
    await page.getByRole("tab", { name: /everything else/i }).click({ timeout: 4000 });
    await page.waitForTimeout(400);
    // A row click opens the ticker now; expansion has its own control.
    await page.getByRole("button", { name: "Show details" }).first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
    await shot(page, "state--today-row-expanded");
  });

  await step("masthead and tape", async () => {
    await page.goto("/");
    await freeze(page);
    await settle(page);
    await page.locator("section", { hasText: "Today’s tape" }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, "state--today-masthead-tape");
  });
});

test("state: screener — run and results", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESKTOP);
  await page.goto("/screener");
  await freeze(page);
  await settle(page);
  await shot(page, "state--screener-empty");

  await step("run shortlist", async () => {
    await page.getByPlaceholder(/filter tickers/i).fill("AAPL, MSFT, NVDA, TSLA, AMD");
    await page.getByRole("button", { name: /^Run$/ }).click();
    await page.waitForTimeout(1200);
    await shot(page, "state--screener-loading");
    await page.waitForTimeout(35_000); // agent ensemble, 10–30s
    await unrollScroller(page);
    await shot(page, "state--screener-results", { full: true });
  });
});

test("state: command palette and help overlay", async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await page.goto("/");
  await freeze(page);
  await settle(page);

  await step("cmd-k", async () => {
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(400);
    await shot(page, "state--command-palette");
    await page.keyboard.press("Escape");
  });

  await step("help", async () => {
    await page.keyboard.press("?");
    await page.waitForTimeout(400);
    await shot(page, "state--help-overlay");
    await page.keyboard.press("Escape");
  });
});

test("state: rails in isolation", async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await page.goto("/");
  await freeze(page);
  await settle(page);

  await step("left rail", async () => {
    await page.locator("aside").first().screenshot({ path: path.join(OUT, "rail--left.png") });
    console.log("  ✓ rail--left.png");
  });
  await step("right rail", async () => {
    await page.locator("aside").last().screenshot({ path: path.join(OUT, "rail--right.png") });
    console.log("  ✓ rail--right.png");
  });
  await step("nav + context strip", async () => {
    await page.locator("nav").first().screenshot({ path: path.join(OUT, "chrome--nav.png") });
    console.log("  ✓ chrome--nav.png");
  });
});

// ── 3. A written record of what the browser actually reported ────────────────

test("audit: console errors, computed layout, contrast inputs", async ({ page }) => {
  // One navigation + 1.5s settle per route, over every route in ROUTES — the
  // 30s default is a coin flip on a cold dev server.
  test.setTimeout(120_000);
  await page.setViewportSize(AUDIT);
  const report: Record<string, unknown> = {};

  for (const route of ROUTES) {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    const res = await page.goto(route.path).catch(() => null);
    await settle(page, 1500);
    // Rails first: every width below is measured off the space they leave.
    await waitForRails(page, route.path);

    report[route.path] = {
      status: res?.status() ?? "no response",
      consoleErrors: errors.slice(0, 10),
      // The measurements the code review can only guess at:
      metrics: await page.evaluate(() => {
        const main = document.querySelector("#main");
        // The element that owns the cap, not whatever happens to be first.
        // `#main`'s first child is the options sub-shell wrapper on seven
        // routes and the `<Page>` itself on the rest, so the old reading
        // compared two different DOM levels and produced a fourth width that
        // no page declared. `data-page-width` is `Page`'s own marker.
        const owner = main?.querySelector("main[data-page-width]") as HTMLElement | null;
        const content = owner ?? (main?.firstElementChild as HTMLElement | null);
        const cs = content ? getComputedStyle(content) : null;
        return {
          scrollHeight: main?.scrollHeight ?? null,
          clientHeight: main?.clientHeight ?? null,
          contentWidth: content?.getBoundingClientRect().width ?? null,
          // Which element the width above came from. A route on `fallback` has
          // no `<Page>` at all — that is a finding, not a measurement.
          contentSource: owner ? (owner.getAttribute("data-page-width") ?? "page") : "fallback",
          // Content width alone cannot say whether a route is narrow because
          // its rails are open or because its own shell caps it. `mainWidth` is
          // the space the rails left; the gap between the two is the page's
          // own doing, and that is the half X-02 can actually fix.
          mainWidth: main?.getBoundingClientRect().width ?? null,
          contentPadding: cs ? `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}` : null,
          tables: document.querySelectorAll("table").length,
          rows: document.querySelectorAll("tbody tr").length,
          // every distinct font-size actually rendered, with a count
          fontSizes: (() => {
            const counts: Record<string, number> = {};
            document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
              if (!el.textContent?.trim()) return;
              const s = getComputedStyle(el).fontSize;
              counts[s] = (counts[s] ?? 0) + 1;
            });
            return Object.fromEntries(
              Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
            );
          })(),
          // tooltip-only affordances: triggers with no visible content
          invisibleTips: document.querySelectorAll(".sr-only").length,
          titleAttrs: document.querySelectorAll("[title]").length,
          // the smallest size any text actually rendered at — 11px is the floor
          minFontSize: (() => {
            let min = Infinity;
            document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
              if (!el.textContent?.trim()) return;
              const s = parseFloat(getComputedStyle(el).fontSize);
              if (s > 0 && s < min) min = s;
            });
            return Number.isFinite(min) ? min : null;
          })(),
          // a colour spelled out in markup rather than taken from the token layer
          hexInMarkup: (() => {
            const hex = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;
            const hits: string[] = [];
            document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
              const cls = typeof el.className === "string" ? el.className : "";
              const style = el.getAttribute("style") ?? "";
              if (hex.test(cls) || hex.test(style)) {
                hits.push(`${el.tagName.toLowerCase()}: ${(cls + " " + style).trim().slice(0, 80)}`);
              }
            });
            return hits.slice(0, 10);
          })(),
        };
      }),
    };
    page.removeAllListeners("console");
    page.removeAllListeners("pageerror");
  }

  // Cross-route rollup — the three numbers the conformance pass is judged on.
  const metrics = Object.values(report).map((r) => (r as { metrics: Record<string, number> }).metrics);
  // The width a route reported is only meaningful next to the rung it came
  // from: `wide` reads 1180 where the cap binds and less where the open rails
  // beat it to it. Same rung, less room — not a fourth cap.
  const byRung = Object.entries(report).reduce<Record<string, Record<string, string[]>>>(
    (acc, [routePath, r]) => {
      const m = (r as { metrics: { contentWidth: number | null; contentSource: string } }).metrics;
      const rung = (acc[m.contentSource] ??= {});
      (rung[String(m.contentWidth)] ??= []).push(routePath);
      return acc;
    },
    {},
  );
  report._summary = {
    viewport: AUDIT,
    distinctContentWidths: Array.from(new Set(metrics.map((m) => m.contentWidth))).sort((a, b) => a - b),
    // The ladder the pages actually declare, which is the thing the criterion is
    // about. Pixel widths are downstream of it and of the rails.
    distinctPageWidthRungs: Object.keys(byRung).sort(),
    contentWidthsByRung: byRung,
    routesWithoutPage: Object.entries(report)
      .filter(([, r]) => (r as { metrics: { contentSource: string } }).metrics.contentSource === "fallback")
      .map(([k]) => k),
    minFontSize: Math.min(...metrics.map((m) => m.minFontSize ?? Infinity)),
    totalTitleAttrs: metrics.reduce((n, m) => n + (m.titleAttrs ?? 0), 0),
    routesWithHexInMarkup: Object.entries(report)
      .filter(([, r]) => ((r as { metrics: { hexInMarkup: string[] } }).metrics.hexInMarkup ?? []).length > 0)
      .map(([k]) => k),
  };

  fs.writeFileSync(path.join(OUT, "_audit.json"), JSON.stringify(report, null, 2));
  console.log(`\n  ✓ screens/_audit.json`);
  console.log(`    ${JSON.stringify(report._summary)}`);
  expect(Object.keys(report).length).toBe(ROUTES.length + 1);

  // The file was written first on purpose: these two assertions are what turns
  // the audit from a report nobody opens into a gate. Both ran clean at the time
  // they were added — a nested <button> hydration error on /calendar was the one
  // and only entry, and it was fixed rather than allowlisted. If a third-party
  // script ever makes zero unrealistic, narrow the filter here; don't delete it.
  const routes = Object.entries(report).filter(([k]) => k !== "_summary");
  expect(
    routes.filter(([, r]) => (r as { status: unknown }).status !== 200).map(([k]) => k),
    "routes not returning 200",
  ).toEqual([]);
  expect(
    routes.flatMap(([routePath, r]) =>
      ((r as { consoleErrors: string[] }).consoleErrors ?? []).map(
        (e) => `${routePath}: ${e.split("\n")[0].slice(0, 160)}`,
      ),
    ),
    "browser console errors",
  ).toEqual([]);
});

// ── 4. Phase 1 substrate contract ────────────────────────────────────────────
//
// Unlike the captures above, these are assertions: the substrate is the thing
// every later phase builds on, so a regression here has to fail the run rather
// than show up as a pixel a human might not look at.

/** Seven type roles, plus headroom for SVG chart ticks. */
const MAX_FONT_SIZES = 8;
/** The two capped roles, in px. `full` is fluid and has no number to pin. */
const CONTENT_CAP: Record<string, number> = { prose: 880, wide: 1180 };

// ── Source contract: colour and type stay in the token layer ────────────────
//
// Everything else in this file measures the rendered page. This one reads the
// source, because the hole it closes is invisible from the browser: the capture
// suite counts font sizes and content widths but never colour, and `tsc` does
// not read class strings. A stray `#1e2634` in a component renders exactly like
// the token it duplicates — right up until the token moves.

/** Where a colour is allowed to be spelled out. */
const TOKEN_FILES = ["app/globals.css", "tailwind.config.ts"];

/** Canvas and SVG libraries take colour strings, not CSS custom properties, so
 *  the chart layer resolves tokens to literals at runtime and needs literal
 *  fallbacks to do it. Everything under these paths is exempt for that reason
 *  alone — not because it is allowed to invent colours. */
const CHART_PATHS = ["components/charts/", "lib/chartConventions.ts"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.(ts|tsx|css)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

test("contract: no hex literals or off-scale type outside the token layer", () => {
  const root = process.cwd();
  const violations: string[] = [];
  const hex = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  const px = /text-\[\d+(?:\.\d+)?px\]/g;

  const files = [...sourceFiles(path.join(root, "app")), ...sourceFiles(path.join(root, "components")),
    ...sourceFiles(path.join(root, "lib"))]
    .map((p) => path.relative(root, p))
    .filter((p) => !TOKEN_FILES.includes(p))
    .filter((p) => !CHART_PATHS.some((c) => p.startsWith(c)));

  for (const rel of files) {
    const lines = fs.readFileSync(path.join(root, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const m of line.match(hex) ?? []) {
        violations.push(`${rel}:${i + 1}: hex ${m} — name the token instead`);
      }
      for (const m of line.match(px) ?? []) {
        violations.push(`${rel}:${i + 1}: ${m} — use one of the seven roles`);
      }
    });
  }

  expect(violations, violations.join("\n")).toEqual([]);
});

test("contract: Phase 1 substrate holds on every route", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(LAPTOP);

  const fontSizes = new Set<string>();
  // Keyed by role, not a flat set of numbers. `full` is fluid, so its measured
  // width follows the rails — 952 beside Today's open rails, 1368 beside the
  // 36px strips everywhere else. Both are correct; counting them as two
  // separate caps is what makes a flat set useless here.
  const contentWidths = new Map<string, Set<number>>();
  const violations: string[] = [];

  for (const route of ROUTES) {
    await page.goto(route.path);
    await settle(page, 1500);
    // Same race as the audit: the rails collapse in an effect, so a width read
    // before that lands is a pre-hydration number.
    await waitForRails(page, route.path);

    const m = await page.evaluate(() => {
      const main = document.querySelector("#main");
      const page_ =
        (main?.querySelector("main[data-page-width]") as HTMLElement | null) ??
        (main?.firstElementChild as HTMLElement | null);

      const sizes = new Set<string>();
      document.querySelectorAll<HTMLElement>("#main *").forEach((el) => {
        // Only elements that own rendered text — a wrapper inherits its size.
        const own = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
        );
        if (own) sizes.add(getComputedStyle(el).fontSize);
      });

      // A trigger nobody can see or point at. sr-only text is fine as an
      // accessible *name*; it is not fine as the whole affordance.
      //
      // Zero client rects means the element is not laid out at all — a collapsed
      // disclosure or a `hidden` panel. That is a legitimate state, not a
      // vanished affordance, so only *rendered* zero-area triggers count.
      const invisibleTriggers = Array.from(
        document.querySelectorAll<HTMLElement>("#main button, #main a, #main [role='button']"),
      ).filter((el) => {
        if (el.getClientRects().length === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width < 2 || r.height < 2;
      }).length;

      // A full viewport nested inside RailShell's own viewport-height scroller.
      const viewportTall = Array.from(document.querySelectorAll<HTMLElement>("#main *")).filter(
        (el) => {
          const mh = getComputedStyle(el).minHeight;
          return mh.endsWith("px") && parseFloat(mh) >= window.innerHeight * 0.9;
        },
      ).length;

      return {
        contentWidth: page_ ? Math.round(page_.getBoundingClientRect().width) : null,
        pageWidthAttr: page_?.getAttribute("data-page-width") ?? null,
        fontSizes: Array.from(sizes),
        titleAttrs: document.querySelectorAll("#main [title]").length,
        invisibleTriggers,
        viewportTall,
      };
    });

    m.fontSizes.forEach((s) => fontSizes.add(s));
    if (m.contentWidth !== null && m.pageWidthAttr) {
      const seen = contentWidths.get(m.pageWidthAttr) ?? new Set<number>();
      seen.add(m.contentWidth);
      contentWidths.set(m.pageWidthAttr, seen);
    }

    if (!m.pageWidthAttr) violations.push(`${route.path}: not rendered inside <Page>`);
    if (m.titleAttrs) violations.push(`${route.path}: ${m.titleAttrs} title= attribute(s)`);
    if (m.invisibleTriggers)
      violations.push(`${route.path}: ${m.invisibleTriggers} zero-area trigger(s)`);
    if (m.viewportTall)
      violations.push(`${route.path}: ${m.viewportTall} element(s) min-height ≥ viewport`);
  }

  fs.writeFileSync(
    path.join(OUT, "_contract.json"),
    JSON.stringify(
      {
        fontSizes: Array.from(fontSizes).sort((a, b) => parseFloat(a) - parseFloat(b)),
        contentWidths: Object.fromEntries(
          Array.from(contentWidths, ([role, w]) => [role, Array.from(w).sort((a, b) => a - b)]),
        ),
        violations,
      },
      null,
      2,
    ),
  );

  expect(violations, violations.join("\n")).toEqual([]);
  expect(fontSizes.size, `font sizes: ${Array.from(fontSizes).join(", ")}`).toBeLessThanOrEqual(
    MAX_FONT_SIZES,
  );
  expect(
    Array.from(contentWidths.keys()).filter((r) => r !== "full" && !(r in CONTENT_CAP)),
    "unknown page width role",
  ).toEqual([]);
  // A cap is a ceiling, not a width: Today's two open rails take 488px out of
  // 1440, so a `wide` page there measures 952 and is still conformant. What the
  // contract pins is that the ceiling itself is the token, and that nothing
  // ever exceeds it.
  for (const [role, cap] of Object.entries(CONTENT_CAP)) {
    const seen = Array.from(contentWidths.get(role) ?? []);
    expect(seen.length, `${role}: no route measured`).toBeGreaterThan(0);
    expect(Math.max(...seen), `${role} cap`).toEqual(cap);
    expect(seen.filter((w) => w > cap), `${role} over cap`).toEqual([]);
  }
});

// ── 5. Phase 2 contract — /calendar and the options split ────────────────────

/**
 * The page's default horizon (app/calendar/page.tsx). The contract is that the
 * page renders every event the feed offers for that horizon; a hardcoded floor
 * only measured how far ahead the seed happened to reach the week it was
 * written, and went red at 9 events with nothing actually broken.
 */
const CALENDAR_HORIZON_DAYS = 30;

/** The five sections one page became. All must resolve, or a tab is a 404. */
const OPTIONS_ROUTES = [
  "/options",
  "/options/ladder",
  "/options/gamma",
  "/options/flow",
  "/options/greeks",
];

test("contract: Phase 2 — calendar has events and every options tab resolves", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize(LAPTOP);

  const violations: string[] = [];

  const calendar = await page.goto("/calendar");
  if (calendar?.status() !== 200) violations.push(`/calendar: HTTP ${calendar?.status()}`);
  await settle(page, 2500);

  // Each event is one Collapsible; nothing else on the page discloses.
  const expected: number = await page
    .request.get(`/api/argus/calendar?days=${CALENDAR_HORIZON_DAYS}`)
    .then((r) => r.json())
    .then((j) => (j.events ?? []).length)
    .catch(() => -1);
  const events = await page.locator("#main button[aria-expanded]").count();
  if (expected < 1) {
    // Not a page regression, but not something to pass over in silence either:
    // the seed reaches months ahead, so an empty horizon means the feed is down.
    violations.push(`/calendar: feed returned no events for ${CALENDAR_HORIZON_DAYS}d`);
  } else if (events !== expected) {
    violations.push(`/calendar: rendered ${events} of ${expected} feed events`);
  }

  // The rail's overflow link is the only route into the full calendar from a
  // page that is not the calendar — and the rail is only open on Today, so that
  // is where the link has to exist. Bounded: an absent element here used to sit
  // on the default unlimited locator timeout and eat the whole test budget.
  await page.goto("/");
  await settle(page, 1500);
  const railHref = await page
    .locator('aside a[href="/calendar"]')
    .first()
    .getAttribute("href", { timeout: 5_000 })
    .catch(() => null);
  if (railHref !== "/calendar") violations.push(`rail overflow href: ${railHref}`);

  for (const route of OPTIONS_ROUTES) {
    const res = await page.goto(route);
    if (res?.status() !== 200) violations.push(`${route}: HTTP ${res?.status()}`);
    await settle(page, 1500);

    // The mode switch used to be a 36×20 rectangle labelled only by
    // `aria-label` — it stated neither what it was nor which way it sat.
    const mode = await page.evaluate(() => {
      const group = document.querySelector<HTMLElement>('#main [role="radiogroup"]');
      if (!group) return null;
      return {
        text: (group.textContent ?? "").trim(),
        segments: Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).map((r) =>
          (r.textContent ?? "").trim(),
        ),
      };
    });
    if (!mode) violations.push(`${route}: no mode control`);
    else if (!mode.text) violations.push(`${route}: mode control has empty textContent`);
    else if (mode.segments.some((s) => !s))
      violations.push(`${route}: unlabelled segment in mode control`);
  }

  expect(violations, violations.join("\n")).toEqual([]);
});

/** Aligned, Pulling back, Tech + fund, Everything else. */
const SIGNAL_TABS = 4;

test("contract: Phase 3 — Today is one masthead, one tape, one caveat", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(LAPTOP);

  const violations: string[] = [];

  const home = await page.goto("/");
  if (home?.status() !== 200) violations.push(`/: HTTP ${home?.status()}`);
  await settle(page, 2500);

  // It used to print above each of the four stacked tables.
  const caveats = await page.getByText(/score magnitude does not predict returns/).count();
  if (caveats !== 1) violations.push(`/: caveat printed ${caveats}×, expected once`);

  const tabs = await page.locator('#main [role="tab"]').count();
  if (tabs !== SIGNAL_TABS) violations.push(`/: ${tabs} signal tabs, expected ${SIGNAL_TABS}`);
  const selected = await page.locator('#main [role="tab"][aria-selected="true"]').count();
  if (selected !== 1) violations.push(`/: ${selected} tabs selected, expected exactly 1`);

  // A tab label that is also a panel title says the same thing twice.
  const dupes = await page.evaluate(() => {
    const labels = new Set(
      Array.from(document.querySelectorAll<HTMLElement>('#main [role="tab"]')).map((t) =>
        (t.textContent ?? "").replace(/\d+$/, "").trim()
      )
    );
    return Array.from(document.querySelectorAll<HTMLElement>("#main h2, #main h3"))
      .map((h) => (h.textContent ?? "").trim())
      .filter((t) => labels.has(t));
  });
  if (dupes.length > 0) violations.push(`/: tab label repeated as a heading: ${dupes.join(", ")}`);

  // The masthead and the tape share one request; on a cold Argus that outlasts
  // the settle above, so wait for the tape rather than assume it has landed.
  const tape = page.getByText("Today’s tape");
  await tape
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  if ((await tape.count()) < 1) violations.push("/: no tape on the page");

  expect(violations, violations.join("\n")).toEqual([]);
});

test("contract: Phase 3.2 — the ticker page names each thing once", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(LAPTOP);

  const violations: string[] = [];

  const res = await page.goto("/t/AAPL");
  if (res?.status() !== 200) violations.push(`/t/AAPL: HTTP ${res?.status()}`);
  await settle(page, 2500);

  // The section index names the section you are in and no other, so it can't
  // restate the seven panel titles it points at.
  const rail = page.locator('nav[aria-label="Ticker page sections"]');
  const rails = await rail.count();
  if (rails !== 1) violations.push(`/t/AAPL: ${rails} section rails, expected 1`);
  if (rails === 1) {
    const labels = ((await rail.innerText()) ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length > 1) {
      violations.push(`/t/AAPL: ${labels.length} rail labels visible at rest: ${labels.join(", ")}`);
    }
    if ((await rail.locator('a[href="#sentiment"]').count()) === 0) {
      violations.push("/t/AAPL: sentiment is unreachable from the rail");
    }
  }

  // No panel title printed twice within one scroll.
  const dupeTitles = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("#main .tick.text-title"))) {
      const t = (el.textContent ?? "").trim();
      if (t) seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return Array.from(seen)
      .filter(([, n]) => n > 1)
      .map(([t, n]) => `${t} ×${n}`);
  });
  if (dupeTitles.length > 0) {
    violations.push(`/t/AAPL: title repeated: ${dupeTitles.join(", ")}`);
  }

  // Tier enums are internal. Badge maps them to display copy by default, so a
  // hit here means a surface printed the raw column instead of rendering one.
  const rawTier = await page.getByText(/\b(PRIME|BREAKOUT|STANDARD)_LONG\b/).count();
  if (rawTier > 0) {
    violations.push(`/t/AAPL: raw tier enum printed ${rawTier}×`);
  }

  // The header says what the name is, not only what it costs. Market cap is now
  // a bare compact figure in the identity line beside the sector and the
  // industry — "Technology · Consumer Electronics · $4.98T" — so there is no
  // "mkt cap" label left to match on. Assert the figure itself, scoped to the
  // header, so the check still fails if the cap stops rendering. Both facts come
  // from the fundamentals endpoint: a miss here is the header or yfinance.
  const cap = await page
    .locator("#main section")
    .first()
    .getByText(/^\$\d+(\.\d+)?[MBT]$/)
    .count();
  if (cap === 0) {
    violations.push("/t/AAPL: header exposes no market cap");
  }

  // One earnings date, one basis, one place. Case-insensitive: the chip's copy
  // is sentence case now, and a guard that quietly stops matching is worse than
  // one that fails.
  const earnings = await page.getByText(/earnings (today|tomorrow|in \d+d|\d+d ago)/i).count();
  if (earnings > 1) {
    violations.push(`/t/AAPL: earnings stated ${earnings}×, expected at most once`);
  }

  expect(violations, violations.join("\n")).toEqual([]);
});

/** The sector ETFs the RRG used to plot. Names, not proxies, is the rule. */
const SECTOR_ETFS = ["XLK", "XLE", "XLF", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE"];

/** A position the ensemble has turned against — the reason to open /portfolio. */
const DISAGREEING = [
  { symbol: "NVDA", position: 150, avg_cost: 100, market_value: 18_000, unrealized_pnl: 3_000,
    verdict: "SHORT", score: -0.4, edge: "CONSIDER SELLING" },
];

/** Serve `body` for the portfolio endpoint, which is otherwise a live gateway. */
async function stubPortfolio(page: Page, body: unknown) {
  await page.route("**/api/argus/portfolio", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
  );
}

test("contract: Phase 4 — the window drives the benchmark, sectors are named, the book argues back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize(LAPTOP);

  const violations: string[] = [];

  // ── /macro: the chart's benchmark has to follow the lookback ──────────────
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  await page.goto("/macro");
  await settle(page, 2500);
  requests.length = 0;

  // The lookback switch is a `SegmentedControl` now (X-03), so its segments are
  // radios in a radiogroup, not buttons. Same label, same click, stated role.
  await page.getByRole("radio", { name: "1 week" }).click();
  await settle(page, 2000);

  // 1w's benchmark is 1mo of daily bars; the 1d default is 5d of 30m bars. A
  // chart drawn against the wrong span reads as a divergence that is not there.
  if (!requests.some((u) => u.includes("/macro/series") && u.includes("window=1w")))
    violations.push("/macro: no series request for the selected window");
  if (!requests.some((u) => u.includes("/history/SPY") && u.includes("period=1mo")))
    violations.push("/macro: benchmark did not follow the window to 1mo bars");

  // ── /rotation: industries, and each named once ────────────────────────────
  await page.goto("/rotation");
  await settle(page, 2500);

  const industries = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("#main tbody tr td:first-child")).map((td) =>
      (td.textContent ?? "").replace(/^\s*\d+\s*/, "").trim()
    )
  );
  if (industries.length < 8)
    violations.push(`/rotation: ${industries.length} industries, expected ≥ 8`);
  const etfs = industries.filter((i) => SECTOR_ETFS.includes(i));
  if (etfs.length > 0) violations.push(`/rotation: plotted ETF proxies, not sectors: ${etfs}`);

  // The chart's legend named all twelve about 100px above the table that names
  // the same twelve. The legend went; nothing may bring it back.
  const twice = await page.evaluate(
    (names) =>
      names.filter(
        (n) =>
          Array.from(document.querySelectorAll<HTMLElement>("#main *")).filter(
            (el) => el.children.length === 0 && (el.textContent ?? "").trim() === n
          ).length > 1
      ),
    industries
  );
  if (twice.length > 0) violations.push(`/rotation: sector named twice: ${twice.join(", ")}`);

  // ── /portfolio: the disagreement band ─────────────────────────────────────
  await stubPortfolio(page, DISAGREEING);
  await page.goto("/portfolio");
  await settle(page, 2000);

  if ((await page.getByText(/Argus has turned against 1 position/).count()) !== 1)
    violations.push("/portfolio: no disagreement band for a CONSIDER SELLING position");

  expect(violations, violations.join("\n")).toEqual([]);
});

/** Pin lives in the bar too, but its label depends on whether the name is pinned. */
const ACTION_VERBS = ["Alert", "Options", "Compare"];

test("contract: Phase 5 — one action bar, and every surface reaches your book", async ({
  page,
}) => {
  // Six navigations, three of them cold compiles: this is a slow test by shape.
  test.setTimeout(300_000);
  await page.setViewportSize(LAPTOP);

  const violations: string[] = [];

  // ── The five verbs, same order, wherever a ticker is named ────────────────
  await page.goto("/t/AAPL");
  await settle(page, 2500);

  // Scoped to the page body: the left rail carries its own Options destination,
  // and the contract is about the bar beside the ticker, not the nav.
  const body = page.locator("#main");
  for (const verb of ACTION_VERBS) {
    if ((await body.getByRole("link", { name: verb }).count()) === 0)
      violations.push(`/t/AAPL: no ${verb} action`);
  }
  // An action pointing at the surface you are on is a jump, not a navigation.
  const optionsHref = await body
    .getByRole("link", { name: "Options" })
    .first()
    .getAttribute("href");
  if (optionsHref !== "#options")
    violations.push(`/t/AAPL: Options action points at ${optionsHref}, not the block on the page`);
  if ((await page.getByRole("button", { name: /^Copy AAPL$/ }).count()) === 0)
    violations.push("/t/AAPL: no Copy action");

  // ── calendar event → affected names → positions ───────────────────────────
  // The feed is stubbed rather than read: whether any watchlist name happens to
  // report inside the horizon is a fact about the week, and this used to skip
  // itself silently on the weeks it didn't. What is under test is the wiring
  // from an earnings row to the position it affects, which holds every week.
  const reporting = "AAPL";
  const today = new Date().toISOString().slice(0, 10);
  await page.route("**/api/argus/calendar*", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        today,
        days: 30,
        events: [
          {
            date: today,
            time_et: "16:30",
            event: `${reporting} Q3 earnings`,
            category: "earnings",
            importance: "high",
            source: "e2e-stub",
            ticker: reporting,
          },
        ],
      }),
    })
  );
  await stubPortfolio(page, [{ symbol: reporting, position: 250 }]);
  await page.goto("/calendar");
  await settle(page, 2500);
  // No word boundaries: the accessible name concatenates the chip, the ticker
  // and the figure columns with no whitespace between them.
  await page.getByRole("button", { name: new RegExp(reporting) }).first().click();
  const held = page.locator('#main a[href="/portfolio"]');
  await held.first().waitFor({ timeout: 10_000 }).catch(() => {});
  if ((await held.count()) === 0)
    violations.push(`/calendar: ${reporting} reports and is held, but the row reaches no position`);
  await page.unroute("**/api/argus/calendar*");

  // ── sector → its candidates → the ones you hold ───────────────────────────
  await page.goto("/rotation");
  await settle(page, 2500);

  // Only the industries in today's bridge run have candidates, and they are not
  // the top-ranked ones by any rule — so try the rows in order until one names
  // a ticker, rather than assuming the first does.
  const rows = page.locator("#main tbody tr");
  const names = page.locator('#main a[href^="/t/"]');
  let picked = -1;
  let candidate: string | null = null;
  for (let i = 0; i < Math.min(await rows.count(), 12) && !candidate; i++) {
    await rows.nth(i).click();
    candidate = await names
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (candidate) picked = i;
    else await rows.nth(i).click(); // release the pick before trying the next
  }
  if (!candidate) {
    // Every sector's candidates come from today's bridge signals, and the join
    // now keys on the rotation model's own industry vocabulary — so twelve
    // sectors naming nobody means the join broke, not that the day was quiet.
    violations.push("/rotation: none of the top 12 sectors named a candidate");
  } else {
    await stubPortfolio(page, [{ symbol: candidate.trim(), position: 250 }]);
    await page.goto("/rotation");
    await settle(page, 2500);
    await page.locator("#main tbody tr").nth(picked).click();
    const held = page.locator('#main a[href="/portfolio"]');
    await held.first().waitFor({ timeout: 10_000 }).catch(() => {});
    if ((await held.count()) === 0)
      violations.push(`/rotation: ${candidate} is a candidate and is held, but the band says nothing`);
  }

  expect(violations, violations.join("\n")).toEqual([]);
});
