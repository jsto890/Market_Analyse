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
  { path: "/options/learn", name: "options-learn" },
  { path: "/calendar", name: "calendar" },
  { path: "/watchlist", name: "watchlist" },
  { path: "/screener", name: "screener" },
  { path: "/portfolio", name: "portfolio" },
  { path: "/alerts", name: "alerts" },
  { path: "/rotation", name: "rotation" },
  { path: "/macro", name: "macro" },
  { path: "/brief", name: "brief" },
  { path: "/glossary", name: "glossary" },
  { path: "/sources", name: "sources" },
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
    const toggle = page.getByRole("switch", { name: /live options ladder/i });
    await toggle.click({ timeout: 5000 });
    await page.waitForTimeout(3000); // let the 500ms poller land a snapshot
    await shot(page, "state--strikes-live-mode");

    // The 23-column table past the sticky Strike column: can you still tell
    // which side (calls vs puts) you are reading?
    const scroller = page.locator("div.overflow-auto").filter({ has: page.locator("table") }).first();
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
    await page.getByRole("button", { name: /^HC only$/i }).click({ timeout: 4000 });
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
  const report: Record<string, unknown> = {};

  for (const route of ROUTES) {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    const res = await page.goto(route.path).catch(() => null);
    await settle(page, 1500);

    report[route.path] = {
      status: res?.status() ?? "no response",
      consoleErrors: errors.slice(0, 10),
      // The measurements the code review can only guess at:
      metrics: await page.evaluate(() => {
        const main = document.querySelector("#main");
        const content = main?.firstElementChild as HTMLElement | null;
        const cs = content ? getComputedStyle(content) : null;
        return {
          scrollHeight: main?.scrollHeight ?? null,
          clientHeight: main?.clientHeight ?? null,
          contentWidth: content?.getBoundingClientRect().width ?? null,
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
        };
      }),
    };
    page.removeAllListeners("console");
    page.removeAllListeners("pageerror");
  }

  fs.writeFileSync(path.join(OUT, "_audit.json"), JSON.stringify(report, null, 2));
  console.log(`\n  ✓ screens/_audit.json`);
  expect(Object.keys(report).length).toBe(ROUTES.length);
});

// ── 4. Phase 1 substrate contract ────────────────────────────────────────────
//
// Unlike the captures above, these are assertions: the substrate is the thing
// every later phase builds on, so a regression here has to fail the run rather
// than show up as a pixel a human might not look at.

/** Six type roles + ReadThis's 12px, plus headroom for SVG chart ticks. */
const MAX_FONT_SIZES = 8;
/** prose 880 / wide 1240 / full fluid. */
const MAX_CONTENT_WIDTHS = 3;

test("contract: Phase 1 substrate holds on every route", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(LAPTOP);

  const fontSizes = new Set<string>();
  const contentWidths = new Set<number>();
  const violations: string[] = [];

  for (const route of ROUTES) {
    await page.goto(route.path);
    await settle(page, 1500);

    const m = await page.evaluate(() => {
      const main = document.querySelector("#main");
      const page_ = main?.querySelector("main") ?? (main?.firstElementChild as HTMLElement | null);

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
    if (m.contentWidth !== null) contentWidths.add(m.contentWidth);

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
        contentWidths: Array.from(contentWidths).sort((a, b) => a - b),
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
    contentWidths.size,
    `content widths: ${Array.from(contentWidths).join(", ")}`,
  ).toBeLessThanOrEqual(MAX_CONTENT_WIDTHS);
});

// ── 5. Phase 2 contract — /calendar and the options split ────────────────────

/** Two months of macro releases plus watchlist earnings. Below this the page is
 * a stub, which is what it was before the endpoint served more than 7 days. */
const MIN_CALENDAR_EVENTS = 20;

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
  const events = await page.locator("#main button[aria-expanded]").count();
  if (events < MIN_CALENDAR_EVENTS)
    violations.push(`/calendar: ${events} events, expected ≥ ${MIN_CALENDAR_EVENTS}`);

  // The rail's overflow link is the only route into the full calendar from a
  // page that is not the calendar.
  const railHref = await page
    .locator('aside a[href="/calendar"]')
    .first()
    .getAttribute("href")
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

  // The header says what the name is, not only what it costs. Both come from
  // the fundamentals endpoint, so a failure here is either the header or yfinance.
  if ((await page.getByText(/mkt cap /).count()) === 0) {
    violations.push("/t/AAPL: header exposes no market cap");
  }

  // One earnings date, one basis, one place.
  const earnings = await page.getByText(/earnings (today|tomorrow|in \d+d|\d+d ago)/).count();
  if (earnings > 1) {
    violations.push(`/t/AAPL: earnings stated ${earnings}×, expected at most once`);
  }

  expect(violations, violations.join("\n")).toEqual([]);
});
