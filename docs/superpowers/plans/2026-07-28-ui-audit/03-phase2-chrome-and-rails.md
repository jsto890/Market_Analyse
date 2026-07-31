# Phase 2: Global Chrome & Rails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix every P0/P1/P2 finding in the UI audit's global chrome (nav, context strip, command palette, help overlay, shell) and left/right rail sections so the chrome is discoverable, accessible, and internally consistent, without touching any page body.
**Architecture:** Chrome stays exactly where it is today — `app/layout.tsx` mounts `Nav`/`ContextStrip`/`CommandK`/`HelpOverlay`/`RailShell` once, and every route renders inside `RailShell`'s content slot. This phase adds two new shared hooks (`useMarketClock`, `visibilityAwareInterval`), one new shell primitive (`PageShell`, consumed by nobody yet — adoption is each page's own phase), and otherwise edits the existing chrome/rail component files in place — no new component tree shape.
**Tech Stack:** Next.js 14.2 App Router, React 18.3, SWR 2.4, Radix UI (`@radix-ui/react-tooltip`, `@radix-ui/react-popover`), Tailwind (token classes only, per `00-foundations-contract.md`), Vitest 4 `component` project (jsdom + RTL) per `01-phase0-test-infra.md`.
**Depends on:** Phase 0 (test infra — `@/test/render`, `@/test/fetchMock`, `@/test/localStorage`), Phase 1 (design system — this plan assumes `--muted-2` is already wired into `tailwind.config.ts` as `text-muted-2`/`bg-muted-2`; no primitive from `components/ui/` in the frozen contract is consumed by chrome/rails in this phase — Nav/rails use plain tokens, not `Button`/`Toggle`/`InfoTip`, because none of their existing controls migrate to those primitives in this pass), `00-foundations-contract.md` (tokens only — `--line-strong`, `--muted-2`, `text-pos`/`text-neg`).

## Global Constraints
- All commands run from `/Users/josephstorey/Market_Analyse/dashboard`.
- Every component test imports `render`/`screen`/`userEvent` from `@/test/render`, never from `@testing-library/react` directly (Phase 0 convention).
- Every fetch-backed component test calls `mockFetchJson(...)` from `@/test/fetchMock` before `render()`.
- Every test whose component reads `localStorage` calls `resetLocalStorage()` from `@/test/localStorage` first.
- Run tests with `npm run test:component` (component project) or `npm run test:unit` (lib project) as specified per task.
- No raw Tailwind palette colors (`bg-blue-500`, `text-emerald-400`, etc.) — token classes only (`text-accent`, `text-pos`, `text-warn`, `border-line-strong`, `text-muted-2`).
- G-14 (settings surface) is explicitly out of scope — the user deferred it. No task in this plan touches it.
- No task in this plan modifies any file under `app/` other than `app/layout.tsx`, and no file under `components/today/`, `components/ticker/`, `components/odte/`, `components/rotation/`, `components/macro/`, or any `app/<route>/page.tsx` — those belong to other phases.

## File Structure

| File | Responsibility |
|---|---|
| `components/NavLinks.tsx` | Modify — add `/macro` link, `aria-current="page"` (G-01, G-12) |
| `components/__tests__/NavLinks.test.tsx` | New — nav link coverage + active-state test |
| `lib/groups.ts` | Modify — export `deriveGroup`, add `GROUP_LABEL` (X-07) |
| `lib/__tests__/groups.test.ts` | Modify — add `deriveGroup`/`GROUP_LABEL` cases |
| `components/CommandK.tsx` | Modify — drop bare `g` (G-03), default-state + action commands (G-04), canonical grouping/labels (X-07) |
| `lib/storageKeys.ts` | Modify — register `dash:commandk:recent` |
| `components/__tests__/CommandK.test.tsx` | New — palette behavior across all three CommandK tasks |
| `components/NavActions.tsx` | Modify — persistent `?` affordance (G-02) |
| `components/__tests__/NavActions.test.tsx` | New |
| `components/HelpOverlay.tsx` | Modify — open via event, drop `g` from key list (Task 5, G-02); add FX session legend (Task 19, LR-08) |
| `components/__tests__/HelpOverlay.test.tsx` | New (Task 5), extended (Task 19) |
| `lib/useMarketClock.ts` | New — shared 30s-tick session-state hook (G-05) |
| `lib/__tests__/useMarketClock.test.ts` | New (jsdom override) |
| `lib/swr-visibility.ts` | New — `visibilityAwareInterval()` for G-13 |
| `lib/__tests__/swr-visibility.test.ts` | New (jsdom override) |
| `components/ContextStrip.tsx` | Modify — `useMarketClock` (G-05), visibility-aware poll (G-13), SYS popover (G-06), freshness line (G-07) |
| `components/__tests__/ContextStrip.test.tsx` | New |
| `lib/rail-quotes.ts` | Modify — visibility-aware poll + `updatedAt` (G-13, feeds G-07) |
| `lib/__tests__/rail-quotes.test.ts` | New (jsdom override) |
| `lib/news.ts` | Modify — visibility-aware poll, exported `sortNewsByTs` (G-13, RR-02) |
| `lib/__tests__/news.test.ts` | New |
| `lib/calendar.ts` | Modify — visibility-aware poll (G-13) |
| `lib/__tests__/calendar.test.ts` | New (jsdom override) |
| `lib/macro.ts` | Modify — visibility-aware poll, `toneClass` → pos/neg tokens (G-13, LR-07) |
| `lib/__tests__/macro.test.ts` | New |
| `lib/watchlist.ts` | New — `useWatchlistTickers()` for RightRail's "My tickers" filter (RR-03) |
| `lib/__tests__/watchlist.test.ts` | New |
| `components/PageShell.tsx` | New — shared shell primitive (G-08 partial, G-09) |
| `components/__tests__/PageShell.test.tsx` | New |
| `app/layout.tsx` | Modify — skip link (G-11, A11Y-05) |
| `components/rails/RailShell.tsx` | Modify — DOM reorder, `id="main"` (G-11, A11Y-05) |
| `components/rails/__tests__/RailShell.test.tsx` | New |
| `components/rails/LeftRail.tsx` | Modify — matchMedia collapse (LR-01), hoist offline banner (LR-02), collapsed-strip glyphs (LR-04), sticky footer (LR-05), block separation (LR-06), FxChip relabel (LR-08), `order-1` (G-11) |
| `components/rails/__tests__/LeftRail.test.tsx` | New |
| `components/rails/QuoteRow.tsx` | Modify — link to `/t/[symbol]` (LR-03) |
| `components/rails/__tests__/QuoteRow.test.tsx` | New |
| `components/rails/MacroGauges.tsx` | Modify — pos/neg tokens (LR-07), 11px + `text-muted-2` (LR-10) |
| `components/rails/__tests__/MacroGauges.test.tsx` | New |
| `components/rails/EconCalendar.tsx` | Modify — "+N more" link + importance legend (LR-09, A11Y-03), 11px + `text-muted-2` (LR-10) |
| `components/rails/__tests__/EconCalendar.test.tsx` | New |
| `components/rails/RightRail.tsx` | Modify — error/empty distinction (RR-01), sort fix (RR-02), ticker filter + new pill (RR-03), WHL code (RR-04), `title` attr (RR-05), hit-area padding (RR-06), `order-3` (G-11) |
| `components/rails/__tests__/RightRail.test.tsx` | New |

---

### Task 1: NavLinks — add `/macro`, mark active link with `aria-current`
**Files:**
- Modify: `components/NavLinks.tsx:6-42`
- Test: `components/__tests__/NavLinks.test.tsx`

**Interfaces:**
- Consumes: `usePathname` (`next/navigation`).
- Produces: `NavLinks` default export unchanged signature (no props); `LINKS` gains an 8th entry `{ href: "/macro", label: "Macro" }`, placed after Rotation (both are market-structure views) and before Screener.

**Audit findings closed:** G-01, G-12

- [ ] **Step 1: Write the failing test**
  Create `components/__tests__/NavLinks.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@/test/render";
  import NavLinks from "@/components/NavLinks";

  vi.mock("next/navigation", () => ({
    usePathname: () => "/rotation",
  }));

  describe("NavLinks", () => {
    it("includes a Macro link pointing at /macro (G-01)", () => {
      render(<NavLinks />);
      expect(screen.getByRole("link", { name: "Macro" })).toHaveAttribute("href", "/macro");
    });

    it("marks the active route with aria-current=page and leaves inactive routes unset (G-12)", () => {
      render(<NavLinks />);
      expect(screen.getByRole("link", { name: "Rotation" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- NavLinks`
  Expected: FAIL — first test with `Unable to find an accessible element with the role "link" and name "Macro"`; second test with `expected element not to have attribute "aria-current"` failing because the "Rotation" assertion fails first (no `aria-current` attribute exists on any link yet).
- [ ] **Step 3: Write minimal implementation**
  Rewrite `components/NavLinks.tsx`:
  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";

  const LINKS = [
    { href: "/", label: "Today" },
    { href: "/watchlist", label: "Watchlist" },
    { href: "/odte", label: "Options" },
    { href: "/rotation", label: "Rotation" },
    { href: "/macro", label: "Macro" },
    { href: "/screener", label: "Screener" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/alerts", label: "Alerts" },
  ] as const;

  export default function NavLinks() {
    const pathname = usePathname();

    return (
      <div className="flex h-full items-stretch gap-0.5">
        {LINKS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center px-2.5 text-[13px] font-medium transition-colors ${
                active ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
              <span
                className={`absolute inset-x-1.5 -bottom-px h-0.5 rounded-t-sm bg-accent transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
            </Link>
          );
        })}
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- NavLinks`  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add components/NavLinks.tsx components/__tests__/NavLinks.test.tsx
  git commit -m "fix(nav): add /macro link and aria-current=page on active nav link"
  ```

---

### Task 2: `lib/groups.ts` — export `deriveGroup` + canonical `GROUP_LABEL`; CommandK consumes both
**Files:**
- Modify: `lib/groups.ts:44-49`
- Modify: `lib/__tests__/groups.test.ts`
- Modify: `components/CommandK.tsx:44-86,205-233`
- Test: `components/__tests__/CommandK.test.tsx` (created here, extended by Tasks 3–4)

**Interfaces:**
- Consumes: `BridgeRow`, `ReportGroup` (`@/types/bridge`).
- Produces: `deriveGroup(row: BridgeRow): ReportGroup` (now exported, unchanged logic), `GROUP_LABEL: Record<ReportGroup, string>` = `{ aligned: "aligned", pullback: "pullback", tech_fund: "tech+fund", other: "other" }` (short-form wording matching the existing `components/today/DiffStrip.tsx` local copy, since CommandK's result row is a small inline badge, not a section header).

**Audit findings closed:** X-07

- [ ] **Step 1: Write the failing tests**
  Append to `lib/__tests__/groups.test.ts`:
  ```ts
  import { deriveGroup, GROUP_LABEL } from "@/lib/groups";

  describe("deriveGroup", () => {
    it("is exported and classifies a row the same way groupSignals does internally", () => {
      expect(deriveGroup({ group1: true } as any)).toBe("aligned");
      expect(
        deriveGroup({ group1: false, group2: true, conviction: "high", sentiment_score: 0.1 } as any)
      ).toBe("pullback");
      expect(deriveGroup({ group1: false, group2: true, conviction: "low", sentiment_score: 0.5 } as any)).toBe(
        "tech_fund"
      );
      expect(deriveGroup({ group1: false, group2: false } as any)).toBe("other");
    });
  });

  describe("GROUP_LABEL", () => {
    it("has a short-form label for every ReportGroup value", () => {
      expect(GROUP_LABEL.aligned).toBe("aligned");
      expect(GROUP_LABEL.pullback).toBe("pullback");
      expect(GROUP_LABEL.tech_fund).toBe("tech+fund");
      expect(GROUP_LABEL.other).toBe("other");
    });
  });
  ```
  Create `components/__tests__/CommandK.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { render, screen, waitFor } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import { resetLocalStorage } from "@/test/localStorage";
  import CommandK from "@/components/CommandK";

  const push = vi.fn();
  vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

  beforeEach(() => {
    resetLocalStorage();
    push.mockClear();
  });

  it("labels a bridge match using the canonical GROUP_LABEL wording (tech+fund, not tech_fund)", async () => {
    mockFetchJson("/api/bridge", {
      signals: [
        { ticker: "AAPL", group1: false, group2: true, conviction: "low", sentiment_score: 0.5, action_label: "WATCH" },
      ],
    });
    mockFetchJson("/api/watchlist", { watchlist: [] });

    render(<CommandK />);
    window.dispatchEvent(new Event("commandk:open"));
    const input = await screen.findByPlaceholderText("Search ticker…");
    await input.ownerDocument.defaultView!.navigator.clipboard?.readText?.().catch(() => {});
    (input as HTMLInputElement).focus();
    await new Promise((r) => setTimeout(r, 15));

    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.type(input, "AAPL");

    await waitFor(() => expect(screen.getByText("tech+fund")).toBeInTheDocument());
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:unit -- groups` and `npm run test:component -- CommandK`
  Expected: `groups.test.ts` FAILS with `"@/lib/groups" does not provide an export named 'deriveGroup'`; `CommandK.test.tsx` FAILS on `screen.getByText("tech+fund")` — `Unable to find an element with the text: tech+fund` (the raw badge currently renders `tech_fund`).
- [ ] **Step 3: Write minimal implementation**
  In `lib/groups.ts`, change line 44 from `function deriveGroup` to:
  ```ts
  export function deriveGroup(row: BridgeRow): ReportGroup {
  ```
  and append at the end of the file:
  ```ts

  export const GROUP_LABEL: Record<ReportGroup, string> = {
    aligned: "aligned",
    pullback: "pullback",
    tech_fund: "tech+fund",
    other: "other",
  };
  ```
  In `components/CommandK.tsx`, add the import and replace the inline ternary and badge text:
  ```tsx
  import { deriveGroup, GROUP_LABEL } from "@/lib/groups";
  ```
  Replace lines 58–64 (`const group = row.group1 ? "aligned" : ...`) with:
  ```tsx
      const group = deriveGroup(row);
  ```
  Replace line 222 (`<span className="text-muted uppercase tracking-wide">{item.group}</span>`) with:
  ```tsx
                    <span className="text-muted uppercase tracking-wide">{GROUP_LABEL[item.group as keyof typeof GROUP_LABEL]}</span>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:unit -- groups` and `npm run test:component -- CommandK`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add lib/groups.ts lib/__tests__/groups.test.ts components/CommandK.tsx components/__tests__/CommandK.test.tsx
  git commit -m "fix(groups): export deriveGroup + canonical GROUP_LABEL, remove CommandK's duplicate classifier"
  ```

---

### Task 3: CommandK — remove the bare `g` toggle binding
**Files:**
- Modify: `components/CommandK.tsx:104-136`
- Test: `components/__tests__/CommandK.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `onKeyDown` no longer opens/closes on a bare `g` keypress; `⌘K`/`Ctrl+K` and the `commandk:open` custom event remain the only open triggers.

**Audit findings closed:** G-03

- [ ] **Step 1: Write the failing test**
  Append to `components/__tests__/CommandK.test.tsx`:
  ```tsx
  it("does not open on a bare 'g' keypress while typing in an unrelated text field (G-03)", () => {
    mockFetchJson("/api/bridge", { signals: [] });
    mockFetchJson("/api/watchlist", { watchlist: [] });

    document.body.innerHTML = '<textarea id="scratch"></textarea>';
    const scratch = document.getElementById("scratch") as HTMLTextAreaElement;

    render(<CommandK />);
    expect(screen.queryByPlaceholderText("Search ticker…")).not.toBeInTheDocument();

    scratch.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));

    expect(screen.queryByPlaceholderText("Search ticker…")).not.toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- CommandK`
  Expected: FAIL — after the second `dispatchEvent`, `screen.queryByPlaceholderText("Search ticker…")` returns a non-null element, so `not.toBeInTheDocument()` fails.
- [ ] **Step 3: Write minimal implementation**
  In `components/CommandK.tsx`, replace the `onKeyDown` function body (lines 105–124):
  ```tsx
    function onKeyDown(e: KeyboardEvent) {
      const cmdK = e.key === "k" && (e.metaKey || e.ctrlKey);

      if (cmdK && !isEditableTarget()) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (e.key === "Escape") {
        close();
      }
    }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- CommandK`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/CommandK.tsx components/__tests__/CommandK.test.tsx
  git commit -m "fix(commandk): remove bare 'g' hotkey, keep only cmd/ctrl+K and commandk:open"
  ```

---

### Task 4: CommandK — default state (recents + action commands) and action routing
**Files:**
- Modify: `lib/storageKeys.ts` (add one entry to `STATIC_KEYS`, built by Phase 1 per `00-foundations-contract.md` §E)
- Modify: `components/CommandK.tsx:8-18,44-86,160-176,178-244`
- Test: `components/__tests__/CommandK.test.tsx`

**Interfaces:**
- Consumes: `STATIC_KEYS` (`@/lib/storageKeys`, Phase 1).
- Produces: `STATIC_KEYS.commandkRecent = "dash:commandk:recent"`; `CommandK.tsx` exports no new symbols, but its internal `ResultItem` gains `source: "recent" | "action"` variants and `label`/`href` fields; opening the palette with an empty query now renders up to 5 recently-opened tickers followed by up to 8 static navigation actions (Today/Watchlist/Options/Rotation/Macro/Screener/Portfolio/Alerts), instead of an empty list.

**Audit findings closed:** G-04

- [ ] **Step 1: Write the failing tests**
  Append to `components/__tests__/CommandK.test.tsx`:
  ```tsx
  it("shows recent tickers and action commands with an empty query (G-04 default state)", async () => {
    window.localStorage.setItem("dash:commandk:recent", JSON.stringify(["NVDA"]));
    mockFetchJson("/api/bridge", { signals: [] });
    mockFetchJson("/api/watchlist", { watchlist: [] });

    render(<CommandK />);
    window.dispatchEvent(new Event("commandk:open"));

    await screen.findByText("NVDA");
    expect(screen.getByText("recent")).toBeInTheDocument();
    expect(screen.getByText("Go to Watchlist")).toBeInTheDocument();
    expect(screen.getByText("Go to Macro")).toBeInTheDocument();
  });

  it("selecting an action command navigates to its route, not a /t/ ticker route (G-04)", async () => {
    mockFetchJson("/api/bridge", { signals: [] });
    mockFetchJson("/api/watchlist", { watchlist: [] });

    render(<CommandK />);
    window.dispatchEvent(new Event("commandk:open"));

    const action = await screen.findByText("Go to Watchlist");
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(action);

    expect(push).toHaveBeenCalledWith("/watchlist");
    expect(push).not.toHaveBeenCalledWith(expect.stringMatching(/^\/t\//));
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- CommandK`
  Expected: FAIL — first test on `await screen.findByText("NVDA")` timing out (`Unable to find an element with the text: NVDA` — empty query currently renders nothing); second test with `push` never called (`Go to Watchlist` text does not exist).
- [ ] **Step 3: Write minimal implementation**
  In `lib/storageKeys.ts`, add one line inside the `STATIC_KEYS` object:
  ```ts
    commandkRecent: "dash:commandk:recent",
  ```
  In `components/CommandK.tsx`, add the import:
  ```tsx
  import { STATIC_KEYS } from "@/lib/storageKeys";
  ```
  Replace the `ResultItem` interface (lines 13–18):
  ```tsx
  interface ResultItem {
    ticker: string;
    group?: string;
    tier?: string;
    source: "bridge" | "watchlist" | "raw" | "recent" | "action";
    label?: string;
    href?: string;
  }

  const ACTIONS: { id: string; label: string; href: string }[] = [
    { id: "today", label: "Go to Today", href: "/" },
    { id: "watchlist", label: "Go to Watchlist", href: "/watchlist" },
    { id: "options", label: "Go to Options", href: "/odte" },
    { id: "rotation", label: "Go to Rotation", href: "/rotation" },
    { id: "macro", label: "Go to Macro", href: "/macro" },
    { id: "screener", label: "Go to Screener", href: "/screener" },
    { id: "portfolio", label: "Go to Portfolio", href: "/portfolio" },
    { id: "alerts", label: "Go to Alerts", href: "/alerts" },
  ];

  function loadRecentTickers(): string[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STATIC_KEYS.commandkRecent);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
      return [];
    }
  }

  function recordRecentTicker(ticker: string): string[] {
    const next = [ticker, ...loadRecentTickers().filter((t) => t !== ticker)].slice(0, 5);
    try {
      window.localStorage.setItem(STATIC_KEYS.commandkRecent, JSON.stringify(next));
    } catch {
      // ignore quota/privacy-mode failures
    }
    return next;
  }

  function buildDefaultResults(recents: string[]): ResultItem[] {
    const recentItems: ResultItem[] = recents.slice(0, 5).map((ticker) => ({ ticker, source: "recent" }));
    const actionItems: ResultItem[] = ACTIONS.map((a) => ({
      ticker: a.id,
      label: a.label,
      href: a.href,
      source: "action",
    }));
    return [...recentItems, ...actionItems].slice(0, 12);
  }
  ```
  Change `buildResults`'s signature and empty-query branch (lines 44–50):
  ```tsx
  function buildResults(
    query: string,
    bridgeRows: BridgeRow[],
    watchlist: string[],
    recents: string[]
  ): ResultItem[] {
    const q = query.toUpperCase().trim();
    if (!q) return buildDefaultResults(recents);
  ```
  and, just before the final `return results.slice(0, 12);` (was line 85), insert the action-matching loop:
  ```tsx
    for (const action of ACTIONS) {
      if (action.label.toUpperCase().includes(q)) {
        results.push({ ticker: action.id, label: action.label, href: action.href, source: "action" });
      }
    }

  ```
  In the component, add recents state and refresh it on open. Replace line 92 (`const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);`) by adding a line after it:
  ```tsx
    const [recents, setRecents] = useState<string[]>(() => loadRecentTickers());
  ```
  In the `open` effect (around line 149), after `fetchWatchlistTickers().then(setWatchlistTickers).catch(() => {});` add:
  ```tsx
        setRecents(loadRecentTickers());
  ```
  Change the results line (was line 154):
  ```tsx
    const results = buildResults(query, bridgeRows, watchlistTickers, recents);
  ```
  Add a shared `activate` function right before `handleKeyDown` (was line 160):
  ```tsx
    function activate(item: ResultItem) {
      if (item.source === "action" && item.href) {
        router.push(item.href);
      } else {
        setRecents(recordRecentTicker(item.ticker));
        router.push(`/t/${item.ticker}`);
      }
      close();
    }
  ```
  In `handleKeyDown`, replace the `Enter` branch (was lines 167–172):
  ```tsx
    } else if (e.key === "Enter") {
      const item = results[selectedIdx];
      if (item) activate(item);
  ```
  Replace the `li onClick` (was lines 214–217):
  ```tsx
                onClick={() => activate(item)}
  ```
  Replace the ticker label span and the badge area (was lines 219–233):
  ```tsx
                <span className="font-mono font-medium">
                  {item.source === "action" ? item.label : item.ticker}
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  {item.source === "bridge" && item.group && (
                    <span className="text-muted uppercase tracking-wide">{GROUP_LABEL[item.group as keyof typeof GROUP_LABEL]}</span>
                  )}
                  {item.source === "bridge" && item.tier && (
                    <Badge variant="tier" value={item.tier} />
                  )}
                  {item.source === "watchlist" && (
                    <span className="text-muted">watchlist</span>
                  )}
                  {item.source === "recent" && <span className="text-muted">recent</span>}
                  {item.source === "raw" && (
                    <span className="text-muted">Open {item.ticker} →</span>
                  )}
                </span>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- CommandK`  Expected: PASS (all CommandK tests, Tasks 2–4 combined)
- [ ] **Step 5: Commit**
  ```bash
  git add lib/storageKeys.ts components/CommandK.tsx components/__tests__/CommandK.test.tsx
  git commit -m "feat(commandk): default-state recents + action commands so an empty query isn't a dead end"
  ```

---

### Task 5: NavActions — persistent `?` affordance; HelpOverlay opens via event and drops the stale `g` reference
**Files:**
- Modify: `components/NavActions.tsx:8-18`
- Modify: `components/HelpOverlay.tsx:6-31`
- Test: `components/__tests__/NavActions.test.tsx`
- Test: `components/__tests__/HelpOverlay.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `NavActions` dispatches a new `window` custom event `"helpoverlay:open"` (mirrors `CommandK`'s existing `"commandk:open"` pattern) from a visible `?` button; `HelpOverlay` listens for `"helpoverlay:open"` in addition to the `?` keydown; `KEYS`'s first row becomes `{ key: "⌘K", desc: "Open command palette" }` (the removed `g` binding, closed in Task 3, no longer documented).

**Audit findings closed:** G-02

- [ ] **Step 1: Write the failing tests**
  Create `components/__tests__/NavActions.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@/test/render";
  import userEvent from "@testing-library/user-event";
  import NavActions from "@/components/NavActions";

  describe("NavActions", () => {
    it("has a persistent '?' button that dispatches helpoverlay:open (G-02)", async () => {
      const onHelpOpen = vi.fn();
      window.addEventListener("helpoverlay:open", onHelpOpen);

      render(<NavActions />);
      await userEvent.click(screen.getByRole("button", { name: "Show keyboard shortcuts" }));

      expect(onHelpOpen).toHaveBeenCalledTimes(1);
      window.removeEventListener("helpoverlay:open", onHelpOpen);
    });
  });
  ```
  Create `components/__tests__/HelpOverlay.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import HelpOverlay from "@/components/HelpOverlay";

  describe("HelpOverlay", () => {
    it("opens in response to helpoverlay:open, not only the ? keydown (G-02)", async () => {
      render(<HelpOverlay />);
      expect(screen.queryByText("Keyboard shortcuts")).not.toBeInTheDocument();

      window.dispatchEvent(new Event("helpoverlay:open"));

      expect(await screen.findByText("Keyboard shortcuts")).toBeInTheDocument();
    });

    it("documents ⌘K as the palette shortcut and no longer mentions the removed 'g' binding", async () => {
      render(<HelpOverlay />);
      window.dispatchEvent(new Event("helpoverlay:open"));
      await screen.findByText("Keyboard shortcuts");

      expect(screen.getByText("⌘K")).toBeInTheDocument();
      expect(screen.queryByText("g  /  ⌘K")).not.toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- NavActions HelpOverlay`
  Expected: FAIL — `NavActions.test.tsx` with `Unable to find an accessible element with the role "button" and name "Show keyboard shortcuts"`; `HelpOverlay.test.tsx` first test timing out on `findByText("Keyboard shortcuts")` (no listener for `helpoverlay:open` yet), second test failing on `getByText("⌘K")` (`Unable to find an element with the text: ⌘K`, current text is `g  /  ⌘K`).
- [ ] **Step 3: Write minimal implementation**
  Replace `components/NavActions.tsx`:
  ```tsx
  "use client";

  export default function NavActions() {
    function openCommandK() {
      window.dispatchEvent(new CustomEvent("commandk:open"));
    }

    function openHelp() {
      window.dispatchEvent(new CustomEvent("helpoverlay:open"));
    }

    return (
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={openCommandK}
          className="text-[13px] text-muted hover:text-foreground transition-colors font-mono"
          aria-label="Open command palette"
        >
          ⌘K
        </button>
        <button
          onClick={openHelp}
          className="text-[13px] text-muted hover:text-foreground transition-colors font-mono"
          aria-label="Show keyboard shortcuts"
        >
          ?
        </button>
      </div>
    );
  }
  ```
  In `components/HelpOverlay.tsx`, replace line 7 (`{ key: "g  /  ⌘K", desc: "Open command palette" },`):
  ```tsx
    { key: "⌘K", desc: "Open command palette" },
  ```
  Replace the `useEffect` body (lines 18–31):
  ```tsx
    useEffect(() => {
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === "?" && !isEditableTarget() && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setOpen((v) => !v);
        }
        if (e.key === "Escape") {
          setOpen(false);
        }
      }

      function onOpen() {
        setOpen((v) => !v);
      }

      document.addEventListener("keydown", onKeyDown);
      window.addEventListener("helpoverlay:open", onOpen);
      return () => {
        document.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("helpoverlay:open", onOpen);
      };
    }, []);
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- NavActions HelpOverlay`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/NavActions.tsx components/HelpOverlay.tsx components/__tests__/NavActions.test.tsx components/__tests__/HelpOverlay.test.tsx
  git commit -m "fix(nav): persistent ? affordance for keyboard shortcuts, drop stale g binding from help list"
  ```

---

### Task 6: `lib/useMarketClock.ts` — shared 30s-tick session-state hook
**Files:**
- Create: `lib/useMarketClock.ts`
- Test: `lib/__tests__/useMarketClock.test.ts` (`// @vitest-environment jsdom` override, `lib` project)
- Modify: `components/ContextStrip.tsx:5,35-39,41-54`
- Modify: `components/rails/LeftRail.tsx:6,15-31`

**Interfaces:**
- Consumes: `usMarketState`, `futuresMarketState`, `UsMarketState`, `FuturesMarketState` (`@/lib/market-clock`, unchanged pure functions).
- Produces: `useMarketClock(): { us: UsMarketState; futures: FuturesMarketState }` — a client hook that computes both states once on mount and then re-computes every 30s via `setInterval`, so components re-render as sessions transition instead of only when an unrelated SWR poll happens to fire.

**Audit findings closed:** G-05

- [ ] **Step 1: Write the failing test**
  Create `lib/__tests__/useMarketClock.test.ts`:
  ```ts
  // @vitest-environment jsdom
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { renderHook, act } from "@testing-library/react";
  import { useMarketClock } from "@/lib/useMarketClock";

  vi.mock("@/lib/market-clock", () => {
    let call = 0;
    return {
      usMarketState: vi.fn(() => (call++ === 0 ? "closed" : "pre")),
      futuresMarketState: vi.fn(() => "open"),
    };
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("useMarketClock", () => {
    it("re-computes session state on a 30s tick without an external re-render trigger (G-05)", () => {
      const { result } = renderHook(() => useMarketClock());
      expect(result.current.us).toBe("closed");

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(result.current.us).toBe("pre");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:unit -- useMarketClock`
  Expected: FAIL with `Cannot find module '@/lib/useMarketClock'` (file does not exist yet).
- [ ] **Step 3: Write minimal implementation**
  Create `lib/useMarketClock.ts`:
  ```ts
  "use client";

  import { useEffect, useState } from "react";
  import {
    usMarketState,
    futuresMarketState,
    type UsMarketState,
    type FuturesMarketState,
  } from "@/lib/market-clock";

  export interface MarketClock {
    us: UsMarketState;
    futures: FuturesMarketState;
  }

  const TICK_MS = 30_000;

  function readClock(): MarketClock {
    return { us: usMarketState(), futures: futuresMarketState() };
  }

  /** Shared session-state clock, ticking every 30s so chrome reflects PRE→REG→AH
   * transitions on its own instead of only re-rendering when an unrelated SWR
   * poll happens to fire (G-05). */
  export function useMarketClock(): MarketClock {
    const [clock, setClock] = useState<MarketClock>(readClock);

    useEffect(() => {
      const id = setInterval(() => setClock(readClock()), TICK_MS);
      return () => clearInterval(id);
    }, []);

    return clock;
  }
  ```
  In `components/ContextStrip.tsx`, replace line 5's import:
  ```tsx
  import { STATE_LABEL, type UsMarketState } from "@/lib/market-clock";
  import { useMarketClock } from "@/lib/useMarketClock";
  ```
  Replace `sessionChip` (lines 35–39) to take the clock as a parameter instead of calling the pure functions itself:
  ```tsx
  function sessionChip(clock: { us: UsMarketState; futures: "open" | "closed" }): string {
    if (clock.us === "closed" && clock.futures === "open") return "OVN";
    return SESSION_CHIP[clock.us];
  }
  ```
  In the component body, add the hook call and pass its result (inside the function starting at line 41):
  ```tsx
  export default function ContextStrip() {
    const clock = useMarketClock();
    const { data } = useSWR<StatusPayload>("/api/status", fetcher, {
      refreshInterval: 60_000,
      shouldRetryOnError: true,
    });

    const aggregate: DotState = data?.aggregate ?? "idle";
  ```
  and update the JSX call site (was line 53) from `{sessionChip()}` to:
  ```tsx
        {sessionChip(clock)}
  ```
  In `components/rails/LeftRail.tsx`, replace line 6's import:
  ```tsx
  import { STATE_LABEL } from "@/lib/market-clock";
  import { useMarketClock } from "@/lib/useMarketClock";
  ```
  Replace `EquityBadge` (lines 15–31):
  ```tsx
  function EquityBadge() {
    const { us: state } = useMarketClock();
    const label = STATE_LABEL[state];
    const cls =
      state === "pre"
        ? "bg-accent/15 text-accent"
        : state === "regular"
        ? "bg-accent/25 text-accent"
        : state === "after"
        ? "bg-accent/10 text-accent/70"
        : "bg-warn/10 text-warn"; // closed
    return (
      <span className={`rounded px-1.5 py-px text-[10px] font-medium font-mono leading-none ${cls}`}>
        {label}
      </span>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:unit -- useMarketClock` and `npm run test:component -- ContextStrip LeftRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add lib/useMarketClock.ts lib/__tests__/useMarketClock.test.ts components/ContextStrip.tsx components/rails/LeftRail.tsx
  git commit -m "feat(clock): shared 30s-tick useMarketClock hook, wire into ContextStrip + LeftRail"
  ```

---

### Task 7: `lib/swr-visibility.ts` — pause polling in background tabs; wire into ContextStrip + all four rail data hooks; add `updatedAt` to `useRailQuotes`
**Files:**
- Create: `lib/swr-visibility.ts`
- Test: `lib/__tests__/swr-visibility.test.ts` (`// @vitest-environment jsdom` override)
- Modify: `components/ContextStrip.tsx:3,41-45`
- Modify: `lib/rail-quotes.ts:1-3,27-39`
- Test: `lib/__tests__/rail-quotes.test.ts` (`// @vitest-environment jsdom` override)
- Modify: `lib/news.ts:1-3,12-17`
- Modify: `lib/calendar.ts:1-3,13-18`
- Test: `lib/__tests__/calendar.test.ts` (`// @vitest-environment jsdom` override)
- Modify: `lib/macro.ts:1-3,13-23`

**Interfaces:**
- Consumes: none new.
- Produces: `visibilityAwareInterval(intervalMs: number): () => number`; `useRailQuotes()` return type gains `updatedAt: number | null` alongside the existing SWR fields (`data`, `error`, etc.).

**Audit findings closed:** G-13

- [ ] **Step 1: Write the failing tests**
  Create `lib/__tests__/swr-visibility.test.ts`:
  ```ts
  // @vitest-environment jsdom
  import { describe, it, expect, afterEach } from "vitest";
  import { visibilityAwareInterval } from "@/lib/swr-visibility";

  afterEach(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  describe("visibilityAwareInterval", () => {
    it("returns 0 while the document is hidden, pausing SWR polling (G-13)", () => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      const interval = visibilityAwareInterval(10_000);
      expect(interval()).toBe(0);
    });

    it("returns the configured interval while the document is visible", () => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      const interval = visibilityAwareInterval(10_000);
      expect(interval()).toBe(10_000);
    });
  });
  ```
  Create `lib/__tests__/rail-quotes.test.ts`:
  ```ts
  // @vitest-environment jsdom
  import { describe, it, expect } from "vitest";
  import { renderHook, waitFor } from "@testing-library/react";
  import { SWRConfig } from "swr";
  import React from "react";
  import { mockFetchJson } from "@/test/fetchMock";
  import { useRailQuotes } from "@/lib/rail-quotes";

  function freshCache({ children }: { children: React.ReactNode }) {
    return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
  }

  describe("useRailQuotes", () => {
    it("records updatedAt in wall-clock time after a successful fetch (feeds G-07)", async () => {
      mockFetchJson("/api/argus/rail/quotes", {
        quotes: [{ symbol: "SPY", price: 500, change_pct: 0.1, group: "indices" }],
        groups: { futures: [], indices: ["SPY"], forex: [] },
        error: null,
      });

      const before = Date.now();
      const { result } = renderHook(() => useRailQuotes(), { wrapper: freshCache });

      await waitFor(() => expect(result.current.data).toBeDefined());
      expect(result.current.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });
  ```
  Create `lib/__tests__/calendar.test.ts`:
  ```ts
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from "vitest";

  let capturedOptions: any;
  vi.mock("swr", () => ({
    default: (_key: string, _fetcher: unknown, options: any) => {
      capturedOptions = options;
      return { data: undefined, error: undefined, isLoading: true };
    },
  }));

  import { useCalendar } from "@/lib/calendar";

  describe("useCalendar visibility-aware polling (G-13)", () => {
    it("passes a refreshInterval function that returns 0 while hidden and 300000 while visible", () => {
      useCalendar(7);

      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      expect(capturedOptions.refreshInterval()).toBe(0);

      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      expect(capturedOptions.refreshInterval()).toBe(300_000);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:unit -- swr-visibility rail-quotes calendar`
  Expected: FAIL — `swr-visibility.test.ts` and `rail-quotes.test.ts` with `Cannot find module '@/lib/swr-visibility'`; `calendar.test.ts` with `capturedOptions.refreshInterval is not a function` (current `useCalendar` passes a plain number, `300000`, not a function).
- [ ] **Step 3: Write minimal implementation**
  Create `lib/swr-visibility.ts`:
  ```ts
  "use client";

  /** SWR `refreshInterval` factory that pauses polling while the document is
   * hidden (backgrounded/minimised tab) and resumes at `intervalMs` once
   * visible again. Pair with `revalidateOnFocus: true` so returning to the
   * tab revalidates immediately instead of waiting for the next tick (G-13). */
  export function visibilityAwareInterval(intervalMs: number): () => number {
    return () => (typeof document !== "undefined" && document.hidden ? 0 : intervalMs);
  }
  ```
  In `components/ContextStrip.tsx`, add the import after line 3 and update the `useSWR` call (lines 41–45):
  ```tsx
  import { visibilityAwareInterval } from "@/lib/swr-visibility";
  ```
  ```tsx
    const { data } = useSWR<StatusPayload>("/api/status", fetcher, {
      refreshInterval: visibilityAwareInterval(60_000),
      revalidateOnFocus: true,
      shouldRetryOnError: true,
    });
  ```
  Replace `lib/rail-quotes.ts` in full:
  ```ts
  "use client";

  import { useState } from "react";
  import useSWR from "swr";
  import { visibilityAwareInterval } from "@/lib/swr-visibility";

  export interface RailQuote {
    symbol: string;
    price: number;
    change_pct: number;
    last_close?: number;
    prev_close?: number;
    group: "futures" | "indices" | "forex";
  }
  export interface RailData {
    quotes: RailQuote[];
    groups: { futures: string[]; indices: string[]; forex: string[] };
    error: string | null;
  }

  // Display labels — terminal-style short tickers.
  export const RAIL_LABEL: Record<string, string> = {
    "ES=F": "ES", "NQ=F": "NQ", "YM=F": "YM", "RTY=F": "RTY", "^VIX": "VIX",
    "CL=F": "CRUDE", "BTC-USD": "BTC", "SPY": "SPY", "QQQ": "QQQ", "IWM": "IWM",
    "DIA": "DIA", "EURUSD=X": "EUR/USD", "USDJPY=X": "USD/JPY",
    "GBPUSD=X": "GBP/USD", "AUDUSD=X": "AUD/USD",
  };

  const fetcher = (url: string) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    });

  export function useRailQuotes() {
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const swr = useSWR<RailData>("/api/argus/rail/quotes", fetcher, {
      refreshInterval: visibilityAwareInterval(10_000),
      revalidateOnFocus: true,
      shouldRetryOnError: false,
      onSuccess: () => setUpdatedAt(Date.now()),
    });
    return { ...swr, updatedAt };
  }
  ```
  In `lib/news.ts`, add the import after line 3 and update the options (was lines 12–16):
  ```ts
  import { visibilityAwareInterval } from "@/lib/swr-visibility";
  ```
  ```ts
  export function useNewsFeed() {
    return useSWR<{ items: NewsItem[]; cursor: number }>(
      "/api/argus/news?latest=60", fetcher,
      { refreshInterval: visibilityAwareInterval(25_000), shouldRetryOnError: false }
    );
  }
  ```
  In `lib/calendar.ts`, add the import after line 3 and update `useCalendar` (was lines 13–18):
  ```ts
  import { visibilityAwareInterval } from "@/lib/swr-visibility";
  ```
  ```ts
  export function useCalendar(days = 7) {
    return useSWR<{ today: string; days: number; events: CalEvent[] }>(
      `/api/argus/calendar?days=${days}`, fetcher,
      { refreshInterval: visibilityAwareInterval(300_000), shouldRetryOnError: false }
    );
  }
  ```
  In `lib/macro.ts`, add the import after line 3 and update both hooks (was lines 13–23):
  ```ts
  import { visibilityAwareInterval } from "@/lib/swr-visibility";
  ```
  ```ts
  export function useMacro() {
    return useSWR<{ gauges: MacroGauge[] }>("/api/argus/macro", fetcher, {
      refreshInterval: visibilityAwareInterval(60_000), shouldRetryOnError: false,
    });
  }

  export function useMacroSeries(scope: string, window: string) {
    return useSWR<{ scope: string; window: string; points: MacroPoint[] }>(
      `/api/argus/macro/series?scope=${encodeURIComponent(scope)}&window=${window}`,
      fetcher, { refreshInterval: visibilityAwareInterval(60_000), shouldRetryOnError: false });
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:unit -- swr-visibility rail-quotes calendar` and `npm run test:component -- ContextStrip`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add lib/swr-visibility.ts lib/__tests__/swr-visibility.test.ts lib/__tests__/rail-quotes.test.ts lib/__tests__/calendar.test.ts lib/rail-quotes.ts lib/news.ts lib/calendar.ts lib/macro.ts components/ContextStrip.tsx
  git commit -m "fix(polling): pause SWR refresh in background tabs, track rail-quotes updatedAt"
  ```

---

### Task 8: ContextStrip — SYS pill becomes a keyboard-reachable Popover button
**Files:**
- Modify: `components/ContextStrip.tsx:1-4,56-80` (as of Task 7's edits — the SYS `Tooltip.Root` block)
- Test: `components/__tests__/ContextStrip.test.tsx` (created here, extended by Task 9)

**Interfaces:**
- Consumes: `@radix-ui/react-popover` (`Popover.Root`, `Popover.Trigger`, `Popover.Portal`, `Popover.Content`, `Popover.Arrow`) — already an installed dependency, unused until now.
- Produces: the SYS pill is now a real `<button>` with `aria-label="System status"` and `aria-expanded`, opened by click or `Enter`/`Space` (native button semantics), not hover-only; its service-status list renders in a `Popover.Content` instead of a `Tooltip.Content`.

**Audit findings closed:** G-06

- [ ] **Step 1: Write the failing test**
  Create `components/__tests__/ContextStrip.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import userEvent from "@testing-library/user-event";
  import { mockFetchJson } from "@/test/fetchMock";
  import ContextStrip from "@/components/ContextStrip";

  describe("ContextStrip SYS pill", () => {
    it("is a real button, closed by default, opened on click — not hover-only (G-06)", async () => {
      mockFetchJson("/api/status", {
        aggregate: "ok",
        services: [{ name: "bridge", state: "ok", detail: "fresh" }],
        bridgeTime: null,
      });

      render(<ContextStrip />);
      const trigger = screen.getByRole("button", { name: "System status" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("bridge")).not.toBeInTheDocument();

      await userEvent.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(await screen.findByText("bridge")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- ContextStrip`
  Expected: FAIL with `Unable to find an accessible element with the role "button" and name "System status"` (the SYS pill is currently a `<span>` inside a Radix `Tooltip.Trigger`, not a button, and has no `aria-label`).
- [ ] **Step 3: Write minimal implementation**
  In `components/ContextStrip.tsx`, replace the import block (lines 1–4… as edited by Task 6/7, the top imports now read `useSWR`, `Tooltip`, `market-clock`, `status`, `useMarketClock`, `swr-visibility`) by adding a Popover import:
  ```tsx
  import * as Popover from "@radix-ui/react-popover";
  ```
  Replace the entire SYS pill block (the `<Tooltip.Root>…</Tooltip.Root>` element) with:
  ```tsx
      {/* SYS health popover; click/Enter/Space opens a service-status list */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="System status"
            className={`inline-flex items-center gap-1 rounded-sm border border-line border-l-2 bg-elevated px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide select-none ${PILL_CLASS[aggregate]}`}
          >
            SYS
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            sideOffset={4}
            className="rounded bg-elevated border border-line px-2 py-1 text-[12px] text-muted shadow-lg z-50 min-w-[180px]"
          >
            {(data?.services ?? []).map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 py-0.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_CLASS[s.state]}`} />
                <span className="font-mono">{s.name}</span> — {s.detail}
              </div>
            ))}
            {!data && <div>status unavailable</div>}
            <Popover.Arrow className="fill-elevated" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
  ```
  (`Popover.Trigger`'s underlying `<button>` provides `aria-expanded` and `aria-haspopup` automatically; Radix syncs `aria-expanded` with open state without any extra prop.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- ContextStrip`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/ContextStrip.tsx components/__tests__/ContextStrip.test.tsx
  git commit -m "fix(context-strip): SYS pill is a keyboard-reachable Popover button, not a hover-only tooltip"
  ```

---

### Task 9: ContextStrip — data freshness label ("bridge HH:MM · quotes Ns ago")
**Files:**
- Modify: `components/ContextStrip.tsx:1-6,49-55` (top imports + strip JSX, as edited by Tasks 6–8)
- Test: `components/__tests__/ContextStrip.test.tsx`

**Interfaces:**
- Consumes: `dualClock` (`@/lib/tz-display`), `StatusPayload.bridgeTime` (`@/lib/status`), `useRailQuotes()`'s `updatedAt` (`@/lib/rail-quotes`, Task 7). SWR's shared cache means this second `useRailQuotes()` call (the first is in `LeftRail`) does not trigger an extra network request when both are mounted, since they share the same key.
- Produces: `freshnessLabel(bridgeTime: string | null, quotesUpdatedAt: number | null): string`, rendered as a muted span in the strip. No exported symbols outside the file — this is ContextStrip-local.

**Audit findings closed:** G-07

- [ ] **Step 1: Write the failing test**
  Append to `components/__tests__/ContextStrip.test.tsx`:
  ```tsx
  it("shows bridge time and quotes age so staleness is visible at a glance (G-07)", async () => {
    mockFetchJson("/api/status", {
      aggregate: "ok",
      services: [],
      bridgeTime: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    mockFetchJson("/api/argus/rail/quotes", {
      quotes: [],
      groups: { futures: [], indices: [], forex: [] },
      error: null,
    });

    render(<ContextStrip />);

    expect(await screen.findByText(/bridge \d{1,2}:\d{2}/)).toBeInTheDocument();
    expect(await screen.findByText(/quotes \d+s ago/)).toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- ContextStrip`
  Expected: FAIL with `Unable to find an element with the text: /bridge \d{1,2}:\d{2}/` (no freshness label rendered yet).
- [ ] **Step 3: Write minimal implementation**
  In `components/ContextStrip.tsx`, add imports:
  ```tsx
  import { dualClock } from "@/lib/tz-display";
  import { useRailQuotes } from "@/lib/rail-quotes";
  ```
  Add a helper function near `sessionChip`:
  ```tsx
  function freshnessLabel(bridgeTime: string | null, quotesUpdatedAt: number | null): string {
    const parts: string[] = [];
    if (bridgeTime) {
      const d = new Date(bridgeTime);
      if (!Number.isNaN(d.getTime())) {
        parts.push(`bridge ${dualClock(d).primary}`);
      }
    }
    if (quotesUpdatedAt !== null) {
      const secs = Math.max(0, Math.round((Date.now() - quotesUpdatedAt) / 1000));
      parts.push(`quotes ${secs}s ago`);
    }
    return parts.join(" · ");
  }
  ```
  In the component body, add the hook call alongside the existing `useSWR<StatusPayload>` call:
  ```tsx
    const { updatedAt: quotesUpdatedAt } = useRailQuotes();
    const freshness = freshnessLabel(data?.bridgeTime ?? null, quotesUpdatedAt);
  ```
  Add the label to the JSX, after the SYS `Popover.Root` block and before the closing `</div>`:
  ```tsx
      {freshness && (
        <span className="text-muted text-[10px] font-mono select-none">{freshness}</span>
      )}
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- ContextStrip`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/ContextStrip.tsx components/__tests__/ContextStrip.test.tsx
  git commit -m "feat(context-strip): show bridge time + quote age so data staleness is visible"
  ```

---

### Task 10: `PageShell` primitive — one owner of page padding, scroll, and max-width
**Files:**
- Create: `components/PageShell.tsx`
- Test: `components/__tests__/PageShell.test.tsx`

**Interfaces:**
- Consumes: none.
- Produces: `PageShell({ width?: "reading" | "dense", children: ReactNode })` — `"reading"` (default) maps to `max-w-5xl` (today's most common width across Watchlist/Portfolio/Alerts/Macro), `"dense"` maps to `max-w-[1400px]` (today's ticker-page width, for data-dense grids like Screener/ODTE). This closes the *primitive-exists* half of G-08/G-09; per-page adoption (replacing each page's own `min-h-screen`/`h-full` wrapper and its own `max-w-*` class) is out of scope for this phase — those files are owned by other phases' plans.

**Audit findings closed:** G-08 (partial — primitive only), G-09

- [ ] **Step 1: Write the failing test**
  Create `components/__tests__/PageShell.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { PageShell } from "@/components/PageShell";

  describe("PageShell", () => {
    it("defaults to the reading width and owns its own scroll container (G-08, G-09)", () => {
      render(
        <PageShell>
          <p>content</p>
        </PageShell>
      );
      const shell = screen.getByText("content").parentElement;
      expect(shell).toHaveClass("max-w-5xl");
      expect(shell).toHaveClass("overflow-y-auto");
    });

    it("switches to the dense width for data-heavy pages", () => {
      render(
        <PageShell width="dense">
          <p>grid</p>
        </PageShell>
      );
      expect(screen.getByText("grid").parentElement).toHaveClass("max-w-[1400px]");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- PageShell`
  Expected: FAIL with `Cannot find module '@/components/PageShell'`.
- [ ] **Step 3: Write minimal implementation**
  Create `components/PageShell.tsx`:
  ```tsx
  import type { ReactNode } from "react";

  export type PageWidth = "reading" | "dense";

  const WIDTH_CLASS: Record<PageWidth, string> = {
    reading: "max-w-5xl",
    dense: "max-w-[1400px]",
  };

  export interface PageShellProps {
    /** "reading" (default, max-w-5xl) for prose/table pages; "dense"
     * (max-w-[1400px]) for data-heavy grids (G-09 — two widths max). */
    width?: PageWidth;
    children: ReactNode;
  }

  /** Single owner of page padding, max-width, and scroll (G-08) so pages stop
   * each hand-rolling their own min-h-screen/h-full wrapper. Adoption per
   * page happens in each page's own phase — this primitive has no callers
   * yet. */
  export function PageShell({ width = "reading", children }: PageShellProps) {
    return (
      <div className={`h-full overflow-y-auto ${WIDTH_CLASS[width]} mx-auto px-6 py-4`}>
        {children}
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- PageShell`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/PageShell.tsx components/__tests__/PageShell.test.tsx
  git commit -m "feat(shell): add PageShell primitive — one owner of page padding/width/scroll"
  ```

---

### Task 11: Skip link + rail DOM reorder — content precedes rails for keyboard/AT users
**Files:**
- Modify: `app/layout.tsx:39-46`
- Modify: `components/rails/RailShell.tsx`
- Test: `components/rails/__tests__/RailShell.test.tsx`
- Test: `e2e/skip-link.spec.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `#main` — the content column's `id`, target of the new skip link, focusable via `tabIndex={-1}`; `RailShell`'s JSX now renders `{children}` before `<LeftRail />`/`<RightRail />` (DOM order), with `order-2` keeping it visually between them (`LeftRail`/`RightRail` themselves gain `order-1`/`order-3` in Tasks 12 and 22, since those classes live on the `<aside>` roots those components own).

**Audit findings closed:** G-11, A11Y-05

- [ ] **Step 1: Write the failing tests**
  Create `components/rails/__tests__/RailShell.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@/test/render";
  import RailShell from "@/components/rails/RailShell";

  vi.mock("@/components/rails/LeftRail", () => ({
    LeftRail: () => <aside data-testid="left-rail">left</aside>,
  }));
  vi.mock("@/components/rails/RightRail", () => ({
    RightRail: () => <aside data-testid="right-rail">right</aside>,
  }));

  describe("RailShell", () => {
    it("puts main content before the rails in DOM order, with a focusable #main skip target (G-11, A11Y-05)", () => {
      render(
        <RailShell>
          <p>page body</p>
        </RailShell>
      );

      const main = document.getElementById("main");
      expect(main).not.toBeNull();
      expect(main).toHaveTextContent("page body");
      expect(main).toHaveAttribute("tabIndex", "-1");

      const left = screen.getByTestId("left-rail");
      const right = screen.getByTestId("right-rail");
      expect(main!.compareDocumentPosition(left) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(main!.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps the content column visually between the rails via order-2", () => {
      render(
        <RailShell>
          <p>page body</p>
        </RailShell>
      );
      expect(document.getElementById("main")).toHaveClass("order-2");
    });
  });
  ```
  Create `e2e/skip-link.spec.ts`:
  ```ts
  import { test, expect } from "@playwright/test";

  test("skip link moves focus past the rails straight to main content (G-11, A11Y-05)", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- RailShell` and `npm run test:e2e -- skip-link`
  Expected: `RailShell.test.tsx` FAILS — `document.getElementById("main")` is `null` (no `id="main"` exists yet, and `LeftRail` currently renders before `{children}`); `skip-link.spec.ts` FAILS — `Unable to find role="link" with name "Skip to content"` (no skip link exists in `layout.tsx`).
- [ ] **Step 3: Write minimal implementation**
  In `app/layout.tsx`, replace the `<body>` block (lines 39–46):
  ```tsx
        <body className="font-sans">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-elevated focus:border focus:border-line focus:px-3 focus:py-1.5 focus:text-[13px] focus:text-foreground"
          >
            Skip to content
          </a>
          <TooltipProvider>
            <Nav contextStrip={<ContextStrip />} />
            <CommandK />
            <HelpOverlay />
            <RailShell>{children}</RailShell>
          </TooltipProvider>
        </body>
  ```
  Replace `components/rails/RailShell.tsx` in full:
  ```tsx
  "use client";

  import { LeftRail } from "./LeftRail";
  import { RightRail } from "./RightRail";

  export default function RailShell({ children }: { children: React.ReactNode }) {
    return (
      <div className="flex flex-row h-[calc(100vh-var(--nav-h))] bg-bg">
        {/* Content is first in the DOM (keyboard/screen-reader order) but sits
         * visually between the rails via order-2; LeftRail/RightRail carry
         * order-1/order-3 on their own <aside> roots (G-11, A11Y-05). */}
        <div id="main" tabIndex={-1} className="order-2 flex-1 min-w-0 overflow-y-auto">
          {children}
        </div>
        <LeftRail />
        <RightRail />
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- RailShell`  Expected: PASS
  Run: `npm run test:e2e -- skip-link`  Expected: FAIL until Task 12 adds `order-1` to `LeftRail`'s `<aside>` roots and Task 22 adds `order-3` to `RightRail`'s — the skip-link *focus* assertion passes now, but note in the commit message that the visual left-to-right order isn't restored until both tasks land (the RailShell component test above already covers `order-2` in isolation).
- [ ] **Step 5: Commit**
  ```bash
  git add app/layout.tsx components/rails/RailShell.tsx components/rails/__tests__/RailShell.test.tsx e2e/skip-link.spec.ts
  git commit -m "fix(a11y): skip link + rails-after-content DOM order so keyboard/AT users reach the page body first"
  ```

---

### Task 12: LeftRail — width-based self-collapse, matching RightRail's `matchMedia` behavior
**Files:**
- Modify: `components/rails/LeftRail.tsx:146-196,237-240`
- Test: `components/rails/__tests__/LeftRail.test.tsx` (created here, extended by Tasks 13, 15–17, 19)

**Interfaces:**
- Consumes: `window.matchMedia` (browser API, same `"(max-width: 1279px)"` query `RightRail.tsx` already uses).
- Produces: `LeftRail`'s exported shape is unchanged; on mount, with no explicit stored preference, it now collapses below 1280px viewport width and reacts live to viewport resizes crossing that threshold, exactly like `RightRail`. Both the collapsed and expanded `<aside>` roots gain `order-1` (paired with Task 11's `order-2` content column and Task 22's `order-3` on `RightRail`, this restores the pre-Task-11 visual left-to-right order).

**Audit findings closed:** LR-01, G-11 (partial — `order-1`)

- [ ] **Step 1: Write the failing tests**
  Create `components/rails/__tests__/LeftRail.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { render, screen } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import { LeftRail } from "@/components/rails/LeftRail";

  vi.mock("@/lib/rail-quotes", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/rail-quotes")>();
    return {
      ...actual,
      useRailQuotes: () => ({ data: undefined, error: undefined, updatedAt: null }),
    };
  });
  vi.mock("@/components/rails/EconCalendar", () => ({ EconCalendar: () => <div /> }));
  vi.mock("@/components/rails/MacroGauges", () => ({ MacroGauges: () => <div /> }));

  beforeEach(() => {
    resetLocalStorage();
  });

  describe("LeftRail width-based collapse (LR-01)", () => {
    it("self-collapses below 1280px viewport width, with no stored preference", () => {
      window.innerWidth = 1000;
      render(<LeftRail />);
      expect(screen.getByLabelText("Expand quote rail")).toBeInTheDocument();
    });

    it("stays expanded at 1280px and above", () => {
      window.innerWidth = 1600;
      render(<LeftRail />);
      expect(screen.getByLabelText("Collapse quote rail")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- LeftRail`
  Expected: FAIL on the first test — `Unable to find a label with the text of: Expand quote rail` (today `LeftRail` ignores viewport width entirely and starts expanded with no stored preference).
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/LeftRail.tsx`, replace the state/effect/toggle block (lines 146–171, from `const LS_KEY = "rail-left-collapsed";` through the closing `};` of `toggle`):
  ```tsx
  const LS_KEY = "rail-left-collapsed";
  const NARROW_QUERY = "(max-width: 1279px)";

  export function LeftRail() {
    // Start expanded SSR; reconcile from localStorage/viewport on mount to avoid hydration mismatch
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
      const readStored = (): string | null => {
        try {
          return window.localStorage.getItem(LS_KEY);
        } catch {
          return null;
        }
      };

      const stored = readStored();
      if (stored === "1") setCollapsed(true);
      else if (stored === "0") setCollapsed(false);
      else setCollapsed(window.innerWidth < 1280);

      if (typeof window.matchMedia !== "function") return;
      const mql = window.matchMedia(NARROW_QUERY);
      const onChange = (e: MediaQueryListEvent) => {
        // Explicit stored preference always wins over the media query.
        if (readStored() !== null) return;
        setCollapsed(e.matches);
      };
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }, []);

    const toggle = () => {
      setCollapsed((prev) => {
        const next = !prev;
        try {
          window.localStorage.setItem(LS_KEY, next ? "1" : "0");
        } catch {
          // ignore
        }
        return next;
      });
    };
  ```
  Add `order-1` to the collapsed `<aside>`'s `className` (was line 182):
  ```tsx
      <aside className="w-9 flex-shrink-0 order-1 flex flex-col items-center py-1 gap-0 border-r border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto font-mono">
  ```
  Add `order-1` to the expanded `<aside>`'s `className` (was lines 237–240):
  ```tsx
    <aside
      className="w-[200px] flex-shrink-0 order-1 bg-surface border-r border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto"
    >
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- LeftRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/LeftRail.tsx components/rails/__tests__/LeftRail.test.tsx
  git commit -m "fix(left-rail): self-collapse below 1280px via matchMedia, matching RightRail"
  ```

---

### Task 13: LeftRail — hoist the offline banner to one rail-level banner
**Files:**
- Modify: `components/rails/LeftRail.tsx:207-215,237-246` (as of Task 12's edits — `renderRows` and the `<aside>` return JSX)
- Test: `components/rails/__tests__/LeftRail.test.tsx`

**Interfaces:**
- Consumes: `useRailQuotes()`'s `error` (`@/lib/rail-quotes`, unchanged shape).
- Produces: no new exports; `QUOTE FEED OFFLINE` now renders exactly once per rail (above the Futures block) instead of once per group (Futures/US Equity/Forex).

**Audit findings closed:** LR-02

- [ ] **Step 1: Write the failing test**
  Append to `components/rails/__tests__/LeftRail.test.tsx`:
  ```tsx
  vi.mock("@/lib/rail-quotes", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/rail-quotes")>();
    return {
      ...actual,
      useRailQuotes: () => ({ data: undefined, error: new Error("500"), updatedAt: null }),
    };
  });

  describe("LeftRail offline banner (LR-02)", () => {
    it("renders QUOTE FEED OFFLINE exactly once, not once per block", () => {
      window.innerWidth = 1600;
      render(<LeftRail />);
      expect(screen.getAllByText("QUOTE FEED OFFLINE")).toHaveLength(1);
    });
  });
  ```
  Note: this second `vi.mock("@/lib/rail-quotes", ...)` call in the same file overrides the Task 12 mock for every test in the file, since `vi.mock` calls are hoisted — that is the intended, simplest way to express "the feed is down" for this describe block without a per-test mock-reset ceremony; Task 12's two tests do not depend on `error` being unset (an `undefined` error is what they already assert against), so this is safe to append as a second top-level `vi.mock`. Vitest keeps only the last `vi.mock` per module path, so delete Task 12's `vi.mock("@/lib/rail-quotes", ...)` block and replace it with this one when you reach this step.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- LeftRail`
  Expected: FAIL — `expect(received).toHaveLength(1)`, received length `3` (Futures/US Equity/Forex each render their own banner today).
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/LeftRail.tsx`, replace the `error` branch inside `renderRows` (was lines 207–215) so it no longer renders the banner itself:
  ```tsx
    function renderRows(group: "futures" | "indices" | "forex") {
      if (error) return null;
      if (isLoading) {
  ```
  (leave the rest of `renderRows` — the `isLoading` and live-data branches — unchanged; only the `if (error)` branch's body changes from the `<div>…QUOTE FEED OFFLINE…</div>` block to `return null;`.)
  In the expanded `<aside>` return JSX, add a single banner above the `Block`s (was lines 241–246, right after the opening `<div className="pt-1 flex flex-col h-full">`):
  ```tsx
        {error && (
          <div className="mx-3 mt-1 mb-0.5 px-2 py-1.5 rounded border border-warn/30 bg-warn/10 text-warn text-[10px] font-mono leading-snug">
            QUOTE FEED OFFLINE
          </div>
        )}

        {/* FUTURES block — no badge */}
        <Block label="Futures">
          {renderRows("futures")}
        </Block>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- LeftRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/LeftRail.tsx components/rails/__tests__/LeftRail.test.tsx
  git commit -m "fix(left-rail): hoist QUOTE FEED OFFLINE to a single rail-level banner"
  ```

---

### Task 14: QuoteRow — rows link to `/t/[symbol]` (skeleton rows stay inert)
**Files:**
- Modify: `components/rails/QuoteRow.tsx:1-3,53,75-89`
- Test: `components/rails/__tests__/QuoteRow.test.tsx`

**Interfaces:**
- Consumes: `Link` (`next/link`).
- Produces: `QuoteRow`'s live-data (non-skeleton) render is now an `<a>` (via `next/link`) pointing at `/t/{symbol}`; the `skeleton` branch is unchanged (no link — there's no real ticker to navigate to yet while the row is a loading placeholder, a deliberate exclusion since linking a skeleton row would be clickable-but-meaningless).

**Audit findings closed:** LR-03

- [ ] **Step 1: Write the failing test**
  Create `components/rails/__tests__/QuoteRow.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { QuoteRow } from "@/components/rails/QuoteRow";

  describe("QuoteRow", () => {
    it("is a link to /t/[symbol] so a rail row navigates like every other ticker string (LR-03)", () => {
      render(<QuoteRow symbol="SPY" price={500} changePct={0.5} />);
      expect(screen.getByRole("link")).toHaveAttribute("href", "/t/SPY");
    });

    it("skeleton rows are not links (no real data to navigate to yet)", () => {
      render(<QuoteRow symbol="SPY" price={0} changePct={0} skeleton />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- QuoteRow`
  Expected: FAIL on the first test — `Unable to find an accessible element with the role "link"` (the row is currently a `cursor-default` `<div>`).
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/QuoteRow.tsx`, add the import after line 1:
  ```tsx
  import Link from "next/link";
  ```
  Replace the non-skeleton return (was lines 75–89):
  ```tsx
    // VIX special-case (spec §11): level has NO color (text-foreground is correct — just no
    // pos/neg applied to the price). The % change column still colors normally.
    return (
      <Link href={`/t/${symbol}`} className="h-[26px] flex items-center px-3 hover:bg-elevated">
        <span className="w-12 text-[11px] font-mono text-muted flex-shrink-0 leading-none">
          {label}
        </span>
        <span className="flex-1 text-right text-[12px] font-mono tabular-nums text-foreground leading-none">
          {formatPrice(symbol, price)}
        </span>
        <span
          className={`w-14 text-right text-[11px] font-mono font-medium tabular-nums leading-none ${pctColor(changePct)}`}
        >
          {formatPct(changePct)}
        </span>
      </Link>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- QuoteRow`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/QuoteRow.tsx components/rails/__tests__/QuoteRow.test.tsx
  git commit -m "fix(quote-row): rail rows link to /t/[symbol] instead of being dead ends"
  ```

---

### Task 15: LeftRail — collapsed-strip glyph indicators for the four hidden blocks
**Files:**
- Modify: `components/rails/LeftRail.tsx:1-10,176-196`
- Test: `components/rails/__tests__/LeftRail.test.tsx`

**Interfaces:**
- Consumes: `forexSessions()` (`@/lib/forex-session`, already imported), `useMacro()` (`@/lib/macro`), `useCalendar()` (`@/lib/calendar`).
- Produces: a new local `HiddenBlockGlyphs()` sub-component rendered in the collapsed (36px) strip, below the SPY/QQQ/VIX `MiniItem`s — three 6px dots (FX session, next calendar event, macro sentiment) each carrying an `aria-label`/`title` describing the hidden block's current state, so collapsing the rail no longer makes Forex/Calendar/Macro vanish without a trace.

**Audit findings closed:** LR-04

- [ ] **Step 1: Write the failing test**
  Append to `components/rails/__tests__/LeftRail.test.tsx`:
  ```tsx
  vi.mock("@/lib/macro", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/macro")>();
    return {
      ...actual,
      useMacro: () => ({ data: { gauges: [{ scope: "global", window: "1d", score: 0.12, n: 40, ts: "" }] } }),
    };
  });
  vi.mock("@/lib/calendar", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/calendar")>();
    return {
      ...actual,
      useCalendar: () => ({
        data: {
          today: "2026-07-28",
          days: 1,
          events: [{ date: "2026-07-28", time_et: "08:30", event: "CPI", category: "econ", importance: "high", source: "s", ticker: null }],
        },
      }),
    };
  });

  describe("LeftRail collapsed-strip glyphs (LR-04)", () => {
    it("shows a glyph per hidden block (FX, next calendar event, macro) instead of dropping them silently", () => {
      window.innerWidth = 1000;
      render(<LeftRail />);
      expect(screen.getByLabelText(/^FX:/)).toBeInTheDocument();
      expect(screen.getByLabelText("Next: CPI")).toBeInTheDocument();
      expect(screen.getByLabelText("Macro: +0.12")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- LeftRail`
  Expected: FAIL — `Unable to find a label with the text of: Macro: +0.12` (the collapsed strip today renders only the three `MiniItem`s and the expand button; no glyph row exists).
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/LeftRail.tsx`, add imports after line 9 (`import { EconCalendar } from "./EconCalendar";`):
  ```tsx
  import { useMacro } from "@/lib/macro";
  import { useCalendar } from "@/lib/calendar";
  ```
  Add a new sub-component, right after `MiniItem` (was line 142, before `// ─── Main component`):
  ```tsx
  /** Collapsed-strip indicators for the blocks the 36px strip otherwise drops
   * entirely (LR-04) — one glyph each for FX session, next calendar event,
   * and macro sentiment. */
  function HiddenBlockGlyphs() {
    const { active, closed } = forexSessions();
    const fxLabel = closed
      ? "FX: closed"
      : active.length > 1
      ? `FX: ${active.join("/")} overlap`
      : active.length === 1
      ? `FX: ${active[0]}`
      : "FX: between sessions";
    const fxClass = closed ? "bg-warn" : active.length > 1 ? "bg-teal" : active.length === 1 ? "bg-accent" : "bg-muted";

    const { data: macroData } = useMacro();
    const globalGauge = (macroData?.gauges ?? []).find((g) => g.scope === "global" && g.window === "1d");
    const macroLabel = globalGauge
      ? `Macro: ${globalGauge.score >= 0 ? "+" : ""}${globalGauge.score.toFixed(2)}`
      : "Macro: —";
    const macroClass = !globalGauge
      ? "bg-muted"
      : globalGauge.score > 0.05
      ? "bg-pos"
      : globalGauge.score < -0.05
      ? "bg-neg"
      : "bg-muted";

    const { data: calData } = useCalendar(1);
    const nextEvent = calData?.events?.[0];
    const calLabel = nextEvent ? `Next: ${nextEvent.event}` : "No events today";

    return (
      <div className="flex flex-col items-center gap-1.5 py-1.5 border-t border-line w-full">
        <span aria-label={fxLabel} title={fxLabel} className={`w-1.5 h-1.5 rounded-full ${fxClass}`} />
        <span
          aria-label={calLabel}
          title={calLabel}
          className={`w-1.5 h-1.5 rounded-full ${nextEvent ? "bg-accent" : "bg-muted"}`}
        />
        <span aria-label={macroLabel} title={macroLabel} className={`w-1.5 h-1.5 rounded-full ${macroClass}`} />
      </div>
    );
  }
  ```
  In the collapsed `<aside>` return (was lines 181–195), insert `<HiddenBlockGlyphs />` between the three `MiniItem`s and the expand button:
  ```tsx
        <MiniItem symbol="SPY" changePct={spyQ?.change_pct} />
        <MiniItem symbol="QQQ" changePct={qqqQ?.change_pct} />
        <MiniItem symbol="^VIX" changePct={vixQ?.change_pct} />
        <HiddenBlockGlyphs />
        {/* Expand button — bottom */}
        <button
          onClick={toggle}
          aria-label="Expand quote rail"
          className="mt-auto w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-[14px] leading-none select-none">›</span>
        </button>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- LeftRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/LeftRail.tsx components/rails/__tests__/LeftRail.test.tsx
  git commit -m "fix(left-rail): collapsed strip shows a glyph per hidden block instead of dropping them"
  ```

---

### Task 16: LeftRail — pin MacroGauges + collapse control as a non-scrolling footer
**Files:**
- Modify: `components/rails/LeftRail.tsx:237-273` (as of Task 13's edits — the expanded `<aside>` return JSX)
- Test: `components/rails/__tests__/LeftRail.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: the expanded `<aside>` becomes a two-region flex column — a `flex-1 min-h-0 overflow-y-auto` scroll region holding Futures/US Equity/Forex/EconCalendar, and a `flex-shrink-0` footer (outside the scroll region) holding `MacroGauges` and the collapse button, so they're always visible without scrolling a short viewport.

**Audit findings closed:** LR-05

- [ ] **Step 1: Write the failing test**
  Append to `components/rails/__tests__/LeftRail.test.tsx`:
  ```tsx
  describe("LeftRail sticky footer (LR-05)", () => {
    it("keeps MacroGauges + the collapse control outside the scrolling content area", () => {
      window.innerWidth = 1600;
      render(<LeftRail />);
      const collapseBtn = screen.getByLabelText("Collapse quote rail");
      expect(collapseBtn.closest(".overflow-y-auto")).toBeNull();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- LeftRail`
  Expected: FAIL — `collapseBtn.closest(".overflow-y-auto")` returns the `<aside>` element itself (today the whole rail, including the footer, is one `overflow-y-auto` scroll container), so `expect(...).toBeNull()` fails.
- [ ] **Step 3: Write minimal implementation**
  Replace the expanded `<aside>` return block in `components/rails/LeftRail.tsx`:
  ```tsx
    return (
      <aside
        className="w-[200px] flex-shrink-0 order-1 bg-surface border-r border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] flex flex-col"
      >
        <div className="pt-1 flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="mx-3 mt-1 mb-0.5 px-2 py-1.5 rounded border border-warn/30 bg-warn/10 text-warn text-[10px] font-mono leading-snug">
              QUOTE FEED OFFLINE
            </div>
          )}

          {/* FUTURES block — no badge */}
          <Block label="Futures">
            {renderRows("futures")}
          </Block>

          {/* US EQUITY block — session badge */}
          <Block label="US Equity" badge={<EquityBadge />} separator>
            {renderRows("indices")}
          </Block>

          {/* FOREX block — FX session chip */}
          <Block label="Forex" badge={<FxChip />} separator>
            {renderRows("forex")}
          </Block>

          {/* What's-next economic calendar — WS-3c */}
          <EconCalendar days={7} />
        </div>

        {/* Non-scrolling footer — always visible, no matter the viewport height (LR-05) */}
        <div className="flex-shrink-0">
          <MacroGauges window="1d" />

          {/* Collapse button per spec §8.5 */}
          <button
            onClick={toggle}
            aria-label="Collapse quote rail"
            className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
          >
            <span className="text-[14px] leading-none select-none">‹</span>
          </button>
        </div>
      </aside>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- LeftRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/LeftRail.tsx components/rails/__tests__/LeftRail.test.tsx
  git commit -m "fix(left-rail): pin MacroGauges + collapse control as a non-scrolling footer"
  ```

---

### Task 17: LeftRail — stronger block separation between Futures/US Equity/Forex
**Files:**
- Modify: `components/rails/LeftRail.tsx:90-103`
- Test: `components/rails/__tests__/LeftRail.test.tsx`

**Interfaces:**
- Consumes: `--line-strong` token (`border-line-strong` Tailwind class, already wired in `tailwind.config.ts`).
- Produces: the local `Block` sub-component's `separator` prop now applies `border-t border-line-strong` (the stronger, higher-contrast line token) instead of `border-t border-line`, so the Futures/US Equity/Forex boundary reads as a real division instead of the same 1px hairline used everywhere else in the rail. `EconCalendar`'s and `MacroGauges`' own `border-t border-line` wrappers get the same swap in Tasks 18 and 20, when those files are next touched — this task closes the `Block`-level (quote-group) portion of LR-06 only.

**Audit findings closed:** LR-06 (partial — quote-group blocks; `EconCalendar`/`MacroGauges` borders close in Tasks 18/20)

- [ ] **Step 1: Write the failing test**
  Append to `components/rails/__tests__/LeftRail.test.tsx`:
  ```tsx
  describe("LeftRail block separation (LR-06)", () => {
    it("uses the stronger line-strong border between quote-group blocks, not the standard 1px line", () => {
      window.innerWidth = 1600;
      render(<LeftRail />);
      // Two Block instances use separator: "US Equity" and "Forex".
      expect(document.querySelectorAll(".border-line-strong").length).toBeGreaterThanOrEqual(2);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- LeftRail`
  Expected: FAIL — `expect(0).toBeGreaterThanOrEqual(2)` (no element currently has `border-line-strong`; the separator is `border-line`).
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/LeftRail.tsx`, replace the `Block` sub-component (lines 90–103):
  ```tsx
  function Block({ label, badge, children, separator }: BlockProps) {
    return (
      <div className={separator ? "border-t border-line-strong pt-0.5" : undefined}>
        {/* Block header §4.3 / §8.2 */}
        <div className="h-[24px] flex items-center justify-between px-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
            {label}
          </span>
          {badge}
        </div>
        {children}
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- LeftRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/LeftRail.tsx components/rails/__tests__/LeftRail.test.tsx
  git commit -m "fix(left-rail): stronger border between quote-group blocks (line-strong, not line)"
  ```

---

### Task 18: MacroGauges + toneClass — green/red convention, not blue/amber
**Files:**
- Modify: `lib/macro.ts:30-35`
- Modify: `components/rails/MacroGauges.tsx:18-23,41`
- Create: `lib/__tests__/macro.test.ts`
- Create: `components/rails/__tests__/MacroGauges.test.tsx`

**Interfaces:**
- `toneClass(score: number): string` — same signature, return values change from `"text-accent"`/`"text-warn"` to `"text-pos"`/`"text-neg"` (muted band unchanged).
- `Gauge`'s bar fill class changes from `pos ? "bg-accent" : "bg-warn"` to `pos ? "bg-pos" : "bg-neg"`, matching the sign convention used by `MicroBar`/`ScoreBar`/`NetBar`/returns/GEX elsewhere in the app (green = positive, red = negative; blue/amber is reserved for accent/warning UI chrome, not data polarity).
- `MacroGauges`' outer wrapper border upgrades from `border-t border-line` to `border-t border-line-strong`, completing the `EconCalendar`/`MacroGauges` half of LR-06 deferred from Task 17.

**Audit findings closed:** LR-07, LR-06 (remaining `MacroGauges` half)

- [ ] **Step 1: Write the failing tests**
  Create `lib/__tests__/macro.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { toneClass } from "@/lib/macro";

  describe("toneClass", () => {
    it("returns the green pos token above +0.05", () => {
      expect(toneClass(0.2)).toBe("text-pos");
    });
    it("returns the red neg token below -0.05", () => {
      expect(toneClass(-0.2)).toBe("text-neg");
    });
    it("returns muted inside the +/-0.05 band", () => {
      expect(toneClass(0)).toBe("text-muted");
    });
  });
  ```
  Create `components/rails/__tests__/MacroGauges.test.tsx`:
  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@/test/render";
  import { MacroGauges } from "@/components/rails/MacroGauges";
  import * as macroLib from "@/lib/macro";

  vi.mock("@/lib/macro", async (importOriginal) => {
    const actual = await importOriginal<typeof macroLib>();
    return { ...actual, useMacro: vi.fn() };
  });

  describe("MacroGauges (LR-07, LR-06)", () => {
    it("renders a positive gauge with the green bg-pos fill, not bg-accent", () => {
      vi.mocked(macroLib.useMacro).mockReturnValue({
        data: { gauges: [{ scope: "global", window: "1d", score: 0.3, n: 12, ts: "2026-07-28T00:00:00Z" }] },
      } as ReturnType<typeof macroLib.useMacro>);
      render(<MacroGauges window="1d" />);
      expect(document.querySelector(".bg-pos")).not.toBeNull();
      expect(document.querySelector(".bg-accent")).toBeNull();
    });

    it("wraps in a border-line-strong container, not the standard border-line", () => {
      vi.mocked(macroLib.useMacro).mockReturnValue({ data: { gauges: [] } } as ReturnType<typeof macroLib.useMacro>);
      render(<MacroGauges window="1d" />);
      expect(document.querySelector(".border-line-strong")).not.toBeNull();
    });
  });
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm run test:lib -- macro` and `npm run test:component -- MacroGauges`
  Expected: FAIL — `toneClass(0.2)` returns `"text-accent"` not `"text-pos"`; no `.bg-pos`/`.border-line-strong` elements exist yet.
- [ ] **Step 3: Write minimal implementation**
  In `lib/macro.ts`, replace lines 30–35:
  ```ts
  /** −1..1 → tone class. Green above +0.05, red below −0.05, muted between. */
  export function toneClass(score: number): string {
    if (score > 0.05) return "text-pos";
    if (score < -0.05) return "text-neg";
    return "text-muted";
  }
  ```
  In `components/rails/MacroGauges.tsx`, replace line 21:
  ```tsx
          className={`absolute top-0 h-full ${pos ? "bg-pos" : "bg-neg"}`}
  ```
  And replace line 41:
  ```tsx
    <div className="border-t border-line-strong">
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:lib -- macro` and `npm run test:component -- MacroGauges`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add lib/macro.ts components/rails/MacroGauges.tsx lib/__tests__/macro.test.ts components/rails/__tests__/MacroGauges.test.tsx
  git commit -m "fix(macro-gauges): green/red polarity convention (bg-pos/bg-neg), stronger block border"
  ```

---

### Task 19: FxChip — single label pattern, one tone; session legend in HelpOverlay
**Files:**
- Modify: `components/rails/LeftRail.tsx:34-78`
- Modify: `components/HelpOverlay.tsx:6-13`
- Test: `components/rails/__tests__/LeftRail.test.tsx`
- Test: `components/__tests__/HelpOverlay.test.tsx`

**Interfaces:**
- `FxChip` (unexported, local to `LeftRail.tsx`) collapses from four visually distinct states (amber CLOSED / muted OPEN / teal overlap / three accent-opacity singles) to one label pattern `FX · {STATE}` rendered in a single tone (`bg-elevated text-muted`), where `{STATE}` is `CLOSED`, `OPEN`, a single session code (`ASIA`/`LDN`/`NY`), or a `·`-joined overlap (`LDN·NY`) — reusing `forexSessions()` unchanged.
- `HelpOverlay`'s `KEYS` table gains a second `<table>` (FX session legend) below the existing shortcuts table, listing the four states and their UTC hour ranges so the meaning of `FX · LDN` etc. is discoverable without color-coding.

**Audit findings closed:** LR-08

- [ ] **Step 1: Write the failing tests**
  Append to `components/rails/__tests__/LeftRail.test.tsx`:
  ```tsx
  describe("FxChip (LR-08)", () => {
    it("renders a single FX · <state> label with one tone, not per-state colors", () => {
      vi.setSystemTime(new Date("2026-07-28T13:00:00Z")); // Mon 13:00 UTC — LDN+NY overlap
      window.innerWidth = 1600;
      render(<LeftRail />);
      const chip = screen.getByText("FX · LDN·NY");
      expect(chip.className).toContain("bg-elevated");
      expect(chip.className).toContain("text-muted");
      expect(chip.className).not.toContain("bg-teal/15");
      expect(chip.className).not.toContain("text-teal");
      vi.useRealTimers();
    });
  });
  ```
  Append to `components/__tests__/HelpOverlay.test.tsx`:
  ```tsx
  it("shows an FX session legend so FX · LDN is discoverable without color", async () => {
    const user = userEvent.setup();
    render(<HelpOverlay />);
    await user.keyboard("?");
    expect(screen.getByText("FX session legend")).toBeInTheDocument();
    expect(screen.getByText(/ASIA/)).toBeInTheDocument();
    expect(screen.getByText(/00:00.*09:00 UTC/)).toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm run test:component -- LeftRail HelpOverlay`
  Expected: FAIL — `getByText("FX · LDN·NY")` finds nothing (current chip renders `LDN·NY` with `bg-teal/15 text-teal`, no `FX ·` prefix); `getByText("FX session legend")` finds nothing.
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/LeftRail.tsx`, replace the entire `FxChip` function (lines 34–78):
  ```tsx
  function FxChip() {
    const { active, closed } = forexSessions();
    const state = closed ? "CLOSED" : active.length === 0 ? "OPEN" : active.join("·");
    return (
      <span className="rounded px-1.5 py-px text-[9px] font-mono font-medium leading-none bg-elevated text-muted">
        FX · {state}
      </span>
    );
  }
  ```
  In `components/HelpOverlay.tsx`, add a second table after the existing shortcuts `<table>` (after line 54's closing `</table>`, before the wrapping `</div>` on line 55):
  ```tsx
        <div className="text-[13px] font-medium text-foreground mt-4 mb-2">FX session legend</div>
        <table className="w-full text-[12px] border-collapse">
          <tbody>
            {[
              { key: "ASIA", desc: "00:00 – 09:00 UTC" },
              { key: "LDN", desc: "07:00 – 16:00 UTC" },
              { key: "NY", desc: "12:00 – 21:00 UTC" },
              { key: "OPEN", desc: "Weekday, between sessions" },
              { key: "CLOSED", desc: "Fri 21:00 UTC – Sun 21:00 UTC" },
            ].map(({ key, desc }) => (
              <tr key={key} className="border-b border-line/40 last:border-0">
                <td className="py-1.5 pr-4 font-mono text-muted whitespace-nowrap">{key}</td>
                <td className="py-1.5 text-foreground/80">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- LeftRail HelpOverlay`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/LeftRail.tsx components/HelpOverlay.tsx components/rails/__tests__/LeftRail.test.tsx components/__tests__/HelpOverlay.test.tsx
  git commit -m "fix(fx-chip): single FX · <state> label, one tone; add session legend to help overlay"
  ```

---

### Task 20: EconCalendar — "+N more" footer link, importance legend with shape (not color-only)
**Files:**
- Modify: `lib/calendar.ts:30-32`
- Modify: `components/rails/EconCalendar.tsx`
- Create: `components/rails/__tests__/EconCalendar.test.tsx`

**Interfaces:**
- `lib/calendar.ts` replaces `importanceColor(importance: string): string` with `importanceMeta(importance: string): { cls: string; label: string }`, returning both a Tailwind class (now shape-differentiated — `rounded-sm` square for `high`, filled `rounded-full` circle for `medium`, hollow bordered `rounded-full` circle for `low`) and a human `label` (`"High importance"` / `"Medium importance"` / `"Low importance"`) used for `title`/`aria-label`, closing the color-only-signal half of LR-09/A11Y-03.
- `EconCalendar`'s `Row` dot gains `title={meta.label}`, `aria-label={meta.label}`, `role="img"`.
- `EconCalendar` slices events to `max` as before but now renders a `"+{remaining} more ›"` footer `<Link href="/macro">` when `events.length > max` (linking to the existing, already-built `/macro` page — no new page created by this task).
- Outer wrapper border upgrades `border-t border-line` → `border-t border-line-strong` (remaining LR-06 border-token bump, deferred from Task 17).

**Audit findings closed:** LR-09, A11Y-03, LR-06 (remaining `EconCalendar` half)

- [ ] **Step 1: Write the failing tests**
  Create `components/rails/__tests__/EconCalendar.test.tsx`:
  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@/test/render";
  import { EconCalendar } from "@/components/rails/EconCalendar";
  import * as calendarLib from "@/lib/calendar";

  vi.mock("@/lib/calendar", async (importOriginal) => {
    const actual = await importOriginal<typeof calendarLib>();
    return { ...actual, useCalendar: vi.fn() };
  });

  function mkEvent(i: number, importance: string) {
    return { date: "2026-07-29", time_et: "08:30", event: `Event ${i}`, category: "econ", importance, source: "bls", ticker: null };
  }

  describe("EconCalendar (LR-09, A11Y-03)", () => {
    it("shows a +N more link to /macro when events exceed max", () => {
      vi.mocked(calendarLib.useCalendar).mockReturnValue({
        data: { today: "2026-07-29", days: 7, events: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => mkEvent(i, "low")) },
      } as ReturnType<typeof calendarLib.useCalendar>);
      render(<EconCalendar days={7} max={6} />);
      const more = screen.getByText("+2 more ›");
      expect(more.closest("a")).toHaveAttribute("href", "/macro");
    });

    it("gives the importance dot a discoverable label and a shape difference, not color-only", () => {
      vi.mocked(calendarLib.useCalendar).mockReturnValue({
        data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "high"), mkEvent(2, "medium")] },
      } as ReturnType<typeof calendarLib.useCalendar>);
      render(<EconCalendar days={7} max={6} />);
      const high = screen.getByLabelText("High importance");
      const medium = screen.getByLabelText("Medium importance");
      expect(high.className).toContain("rounded-sm");
      expect(medium.className).toContain("rounded-full");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- EconCalendar`
  Expected: FAIL — `getByText("+2 more ›")` finds nothing (no footer link exists); `getByLabelText("High importance")` finds nothing (dots have no `aria-label`).
- [ ] **Step 3: Write minimal implementation**
  In `lib/calendar.ts`, replace lines 30–32:
  ```ts
  export function importanceMeta(importance: string): { cls: string; label: string } {
    if (importance === "high") return { cls: "w-1.5 h-1.5 rounded-sm bg-warn", label: "High importance" };
    if (importance === "medium") return { cls: "w-1 h-1 rounded-full bg-accent", label: "Medium importance" };
    return { cls: "w-1 h-1 rounded-full border border-muted bg-transparent", label: "Low importance" };
  }
  ```
  Replace `components/rails/EconCalendar.tsx` in full:
  ```tsx
  "use client";

  import Link from "next/link";
  import { useCalendar, dayLabel, importanceMeta, type CalEvent } from "@/lib/calendar";

  function Row({ ev, today }: { ev: CalEvent; today: string }) {
    const isToday = ev.date === today;
    const meta = importanceMeta(ev.importance);
    return (
      <div className={`px-3 py-1 flex items-center gap-1.5 ${isToday ? "bg-accent/5" : ""}`}>
        <span className={`${meta.cls} flex-shrink-0`} title={meta.label} aria-label={meta.label} role="img" />
        <span className={`text-[10px] font-mono w-9 flex-shrink-0 ${isToday ? "text-accent" : "text-muted"}`}>
          {dayLabel(ev.date, today)}
        </span>
        <span className="text-[10px] font-mono text-foreground truncate flex-1">{ev.event}</span>
        {ev.time_et && <span className="text-[9px] font-mono text-muted opacity-60 flex-shrink-0">{ev.time_et}</span>}
      </div>
    );
  }

  export function EconCalendar({ days = 7, max = 6 }: { days?: number; max?: number }) {
    const { data } = useCalendar(days);
    const today = data?.today ?? "";
    const allEvents = data?.events ?? [];
    const events = allEvents.slice(0, max);
    const remaining = allEvents.length - events.length;

    return (
      <div className="border-t border-line-strong">
        <div className="h-[24px] flex items-center px-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
            What&rsquo;s Next
          </span>
        </div>
        {events.length === 0
          ? <p className="px-3 py-1 text-[10px] font-mono text-muted opacity-60">no events scheduled</p>
          : events.map((ev, i) => <Row key={`${ev.event}-${ev.date}-${i}`} ev={ev} today={today} />)}
        {remaining > 0 && (
          <Link href="/macro" className="block px-3 py-1 text-[10px] font-mono text-muted hover:text-accent">
            +{remaining} more ›
          </Link>
        )}
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- EconCalendar`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add lib/calendar.ts components/rails/EconCalendar.tsx components/rails/__tests__/EconCalendar.test.tsx
  git commit -m "fix(econ-calendar): +N more footer link, shape-differentiated importance legend"
  ```

---

### Task 21: EconCalendar time + MacroGauges empty state — token color, not opacity trick
**Files:**
- Modify: `components/rails/EconCalendar.tsx` (the `Row`'s `time_et` span, written by Task 20)
- Modify: `components/rails/MacroGauges.tsx:49` (the "building…" empty state, written by Task 18)
- Test: `components/rails/__tests__/EconCalendar.test.tsx`
- Test: `components/rails/__tests__/MacroGauges.test.tsx`

**Interfaces:**
- No new interfaces. `EconCalendar`'s `time_et` span moves from `text-[9px] font-mono text-muted opacity-60` to `text-[10px] font-mono text-muted-2` — legible 10px size, and the muted tone comes from the `--muted-2` design token (Phase 1's foundations contract §muted scale) rather than a 40%-opacity multiply on top of `--muted`, which was computed against `--surface` and produced sub-floor contrast.
- `MacroGauges`' "building…" empty-state `<p>` drops `opacity-60` in favor of the same `text-muted-2` token (size was already 10px, so only the opacity-vs-token half of LR-10 applies here).

**Audit findings closed:** LR-10, A11Y-02

- [ ] **Step 1: Write the failing tests**
  Append to `components/rails/__tests__/EconCalendar.test.tsx`:
  ```tsx
  it("renders time_et at a legible 10px with a token color, not a 9px opacity-60 fade", () => {
    vi.mocked(calendarLib.useCalendar).mockReturnValue({
      data: { today: "2026-07-29", days: 7, events: [mkEvent(1, "low")] },
    } as ReturnType<typeof calendarLib.useCalendar>);
    render(<EconCalendar days={7} max={6} />);
    const time = screen.getByText("08:30");
    expect(time.className).toContain("text-[10px]");
    expect(time.className).toContain("text-muted-2");
    expect(time.className).not.toContain("opacity-60");
    expect(time.className).not.toContain("text-[9px]");
  });
  ```
  Append to `components/rails/__tests__/MacroGauges.test.tsx`:
  ```tsx
  it("renders the building… empty state with a token color, not opacity-60", () => {
    vi.mocked(macroLib.useMacro).mockReturnValue({ data: { gauges: [] } } as ReturnType<typeof macroLib.useMacro>);
    render(<MacroGauges window="1d" />);
    const empty = screen.getByText("building…");
    expect(empty.className).toContain("text-muted-2");
    expect(empty.className).not.toContain("opacity-60");
  });
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm run test:component -- EconCalendar MacroGauges`
  Expected: FAIL — `time.className` contains `"text-[9px]"` and `"opacity-60"`, not `"text-[10px]"`/`"text-muted-2"`; `empty.className` contains `"opacity-60"`, not `"text-muted-2"`.
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/EconCalendar.tsx`, replace the `time_et` line inside `Row`:
  ```tsx
        {ev.time_et && <span className="text-[10px] font-mono text-muted-2 flex-shrink-0">{ev.time_et}</span>}
  ```
  In `components/rails/MacroGauges.tsx`, replace line 49:
  ```tsx
        ? <p className="px-3 py-1 text-[10px] font-mono text-muted-2">building…</p>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- EconCalendar MacroGauges`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/EconCalendar.tsx components/rails/MacroGauges.tsx components/rails/__tests__/EconCalendar.test.tsx components/rails/__tests__/MacroGauges.test.tsx
  git commit -m "fix(rails): legible 10px muted-2 token color for time_et and building empty state"
  ```

---

### Task 22: RightRail — distinguish error vs empty news states; restore visual order (G-11 remaining half)
**Files:**
- Modify: `components/rails/RightRail.tsx:55,77,120-129,135-141`
- Test: `components/rails/__tests__/RightRail.test.tsx`

**Interfaces:**
- `NewsFeedBody`'s error branch (`error` truthy) renders an inline `AlertTriangle` icon (from the already-installed `lucide-react`, same package `EmptyState.tsx` uses) at `text-warn`, next to the "news feed offline" text — a shape *and* color difference from the empty branch, which stays icon-free and muted.
- `NewsFeedHeader`'s error branch (`error` truthy) changes `text-muted` → `text-warn` on the "offline" label, matching the body's failure tone.
- Both of `RightRail`'s `<aside>` roots (collapsed strip, line 55; expanded shell, line 77) gain `order-3` in their `className`, so the rail renders visually last while `RailShell`'s DOM order (fixed in Task 11) keeps it after the main content for keyboard/AT users — completing G-11 (left side closed in Task 12).

**Audit findings closed:** RR-01, G-11 (remaining right-rail half)

- [ ] **Step 1: Write the failing test**
  Create `components/rails/__tests__/RightRail.test.tsx`:
  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@/test/render";
  import { RightRail } from "@/components/rails/RightRail";
  import * as newsLib from "@/lib/news";

  vi.mock("@/lib/news", async (importOriginal) => {
    const actual = await importOriginal<typeof newsLib>();
    return { ...actual, useNewsFeed: vi.fn() };
  });

  describe("RightRail error vs empty states (RR-01)", () => {
    it("renders the error state with an amber icon, distinct from the muted empty state", () => {
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: undefined, error: new Error("500"),
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      const offline = screen.getByText("news feed offline");
      expect(offline.className).toContain("text-warn");
      expect(offline.querySelector("svg")).not.toBeNull();
      expect(screen.getByText("offline")).toHaveClass("text-warn");
    });

    it("renders the empty state without an icon and without the warn tone", () => {
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: { items: [] }, error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      const empty = screen.getByText(/no news yet/);
      expect(empty.className).not.toContain("text-warn");
      expect(empty.querySelector("svg")).toBeNull();
    });
  });

  describe("RightRail visual order (G-11)", () => {
    it("places the rail last visually via order-3 on the aside root", () => {
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: { items: [] }, error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      expect(screen.getByLabelText("Collapse news rail").closest("aside")).toHaveClass("order-3");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- RightRail`
  Expected: FAIL — "news feed offline" has `text-muted` not `text-warn`, no `<svg>`; header "offline" has `text-muted`; `<aside>` has no `order-3` class.
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/RightRail.tsx`, add the import:
  ```tsx
  import { AlertTriangle } from "lucide-react";
  ```
  Replace line 55 (`<aside className="w-9 flex-shrink-0 flex flex-col items-center py-1 border-l border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] font-mono">`):
  ```tsx
      <aside className="order-3 w-9 flex-shrink-0 flex flex-col items-center py-1 border-l border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] font-mono">
  ```
  Replace line 77 (`<aside className="w-[260px] flex-shrink-0 bg-surface border-l border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto">`):
  ```tsx
    <aside className="order-3 w-[260px] flex-shrink-0 bg-surface border-l border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto">
  ```
  Replace `NewsFeedHeader` (lines 120–129):
  ```tsx
  function NewsFeedHeader() {
    const { data, error } = useNewsFeed();
    if (error) return <span className="text-[9px] text-warn leading-none">offline</span>;
    if (!data) return <span className="text-[9px] text-muted opacity-40 leading-none">…</span>;
    return (
      <span className="text-[9px] text-muted leading-none">
        {data.items.length}
      </span>
    );
  }
  ```
  Replace the error branch inside `NewsFeedBody` (lines 135–141):
  ```tsx
    if (error) {
      return (
        <p className="flex items-center gap-1.5 text-[11px] text-warn px-3 pt-3 leading-relaxed">
          <AlertTriangle size={12} strokeWidth={2} className="flex-shrink-0" />
          news feed offline
        </p>
      );
    }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- RightRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/RightRail.tsx components/rails/__tests__/RightRail.test.tsx
  git commit -m "fix(right-rail): amber+icon error state distinct from muted empty state, restore visual order"
  ```

---

### Task 23: News feed — sort by timestamp instead of blindly reversing payload order
**Files:**
- Modify: `lib/news.ts` (append after `relTime`, written by Task 7)
- Modify: `components/rails/RightRail.tsx:162` (`NewsFeedBody`, as it stands after Task 22)
- Create: `lib/__tests__/news.test.ts`
- Test: `components/rails/__tests__/RightRail.test.tsx`

**Interfaces:**
- New export `sortNewsByTs(items: NewsItem[], order: "asc" | "desc" = "desc"): NewsItem[]` — returns a new array sorted by `ts` (default newest-first, matching the rail's display order), instead of relying on the API returning payload in a fixed ascending order and blindly `.reverse()`-ing it.
- `NewsFeedBody` replaces `const items = [...data.items].reverse();` with `const items = sortNewsByTs(data.items);`.

**Audit findings closed:** RR-02

- [ ] **Step 1: Write the failing tests**
  Create `lib/__tests__/news.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { sortNewsByTs, type NewsItem } from "@/lib/news";

  function mk(id: number, ts: string): NewsItem {
    return { id, ts, source: "yf", ticker: null, headline: `h${id}`, body: null, url: null, is_breaking: 0 };
  }

  describe("sortNewsByTs", () => {
    it("sorts newest-first by default, regardless of input order", () => {
      const items = [mk(1, "2026-07-28 10:00:00"), mk(2, "2026-07-28 12:00:00"), mk(3, "2026-07-28 11:00:00")];
      expect(sortNewsByTs(items).map((i) => i.id)).toEqual([2, 3, 1]);
    });

    it("sorts oldest-first when order is 'asc'", () => {
      const items = [mk(1, "2026-07-28 10:00:00"), mk(2, "2026-07-28 12:00:00")];
      expect(sortNewsByTs(items, "asc").map((i) => i.id)).toEqual([1, 2]);
    });

    it("does not mutate the input array", () => {
      const items = [mk(1, "2026-07-28 10:00:00"), mk(2, "2026-07-28 12:00:00")];
      sortNewsByTs(items);
      expect(items.map((i) => i.id)).toEqual([1, 2]);
    });
  });
  ```
  Append to `components/rails/__tests__/RightRail.test.tsx`:
  ```tsx
  describe("RightRail feed order (RR-02)", () => {
    it("orders rows by timestamp, not by reversing whatever order the API sent", () => {
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: {
          items: [
            { id: 1, ts: "2026-07-28 09:00:00", source: "yf", ticker: null, headline: "oldest", body: null, url: null, is_breaking: 0 },
            { id: 2, ts: "2026-07-28 11:00:00", source: "yf", ticker: null, headline: "newest", body: null, url: null, is_breaking: 0 },
            { id: 3, ts: "2026-07-28 10:00:00", source: "yf", ticker: null, headline: "middle", body: null, url: null, is_breaking: 0 },
          ],
        },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      const headlines = screen.getAllByText(/oldest|newest|middle/).map((el) => el.textContent);
      expect(headlines).toEqual(["newest", "middle", "oldest"]);
    });
  });
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm run test:lib -- news` and `npm run test:component -- RightRail`
  Expected: FAIL — `sortNewsByTs` is not exported from `@/lib/news`; `RightRail`'s reverse-based ordering happens to pass the mocked-input-order case coincidentally in some fixtures but the `news.test.ts` import itself fails to resolve, so both suites report a hard failure.
- [ ] **Step 3: Write minimal implementation**
  Append to `lib/news.ts`:
  ```ts
  /** Sort by ts; API payload order is not contractually guaranteed. Newest-first by default. */
  export function sortNewsByTs(items: NewsItem[], order: "asc" | "desc" = "desc"): NewsItem[] {
    const sign = order === "asc" ? 1 : -1;
    return [...items].sort(
      (a, b) => sign * (new Date(a.ts.replace(" ", "T")).getTime() - new Date(b.ts.replace(" ", "T")).getTime())
    );
  }
  ```
  In `components/rails/RightRail.tsx`, update the import (line 5) and the body:
  ```tsx
  import { useNewsFeed, relTime, sortNewsByTs, type NewsItem } from "@/lib/news";
  ```
  Replace line 162:
  ```tsx
    const items = sortNewsByTs(data.items);
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:lib -- news` and `npm run test:component -- RightRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add lib/news.ts components/rails/RightRail.tsx lib/__tests__/news.test.ts components/rails/__tests__/RightRail.test.tsx
  git commit -m "fix(news-feed): sort by timestamp instead of reversing raw API order"
  ```

---

### Task 24: News feed filtering — All / My tickers chips, "N new" pill on scroll-away
**Files:**
- Create: `lib/watchlist.ts`
- Create: `lib/__tests__/watchlist.test.ts`
- Modify: `components/rails/RightRail.tsx` (full-file replacement — the expanded `<aside>`, `NewsFeedBody`, and top-level state all change together)
- Test: `components/rails/__tests__/RightRail.test.tsx`

**Interfaces:**
- New `lib/watchlist.ts` export `useWatchlistTickers(): Set<string>` — SWR-backed `Set` of tickers currently pinned via the existing `/api/watchlist` route (`GET` → `{ watchlist: { ticker, pinned_at, price_at_pin }[] }`), 60s refresh, no retry-storm on error.
- `RightRail` gains local state `filter: "all" | "mine"` (two chip buttons, `aria-pressed` reflects selection) and `lastSeenId`/`atTop` (drives an "`N new ↑`" pill that appears once the user has scrolled away from the top and new higher-`id` items have arrived; clicking it resets `scrollTop` to `0` and clears the pill).
- `NewsFeedBody` gains a required `filter: "all" | "mine"` prop; when `"mine"`, it filters the timestamp-sorted list (from Task 23's `sortNewsByTs`) to items whose `ticker` is in the watchlist `Set`, with its own filter-aware empty-state copy.

**Audit findings closed:** RR-03

- [ ] **Step 1: Write the failing tests**
  Create `lib/__tests__/watchlist.test.ts`:
  ```ts
  // @vitest-environment jsdom
  import { describe, it, expect } from "vitest";
  import { renderHook, waitFor } from "@testing-library/react";
  import { useWatchlistTickers } from "@/lib/watchlist";
  import { mockFetchJson } from "@/test/fetchMock";

  describe("useWatchlistTickers", () => {
    it("returns a Set of pinned tickers from /api/watchlist", async () => {
      mockFetchJson("/api/watchlist", {
        watchlist: [
          { ticker: "AAPL", pinned_at: "2026-07-28T00:00:00Z", price_at_pin: 210.5 },
          { ticker: "TSLA", pinned_at: "2026-07-27T00:00:00Z", price_at_pin: 300.1 },
        ],
      });
      const { result } = renderHook(() => useWatchlistTickers());
      await waitFor(() => expect(result.current.size).toBe(2));
      expect(result.current.has("AAPL")).toBe(true);
      expect(result.current.has("TSLA")).toBe(true);
    });
  });
  ```
  Append to `components/rails/__tests__/RightRail.test.tsx` (note: this adds `vi.mock("@/lib/watchlist", ...)` to the file — hoisted `vi.mock` calls apply to every `describe` block in the file; the earlier RR-01/RR-02/G-11 tests above never call `.mine`-filtering, so the default unmocked-return `undefined` from `useWatchlistTickers` is never dereferenced by them and they keep passing unchanged):
  ```tsx
  import { fireEvent } from "@testing-library/react";
  import * as watchlistLib from "@/lib/watchlist";

  vi.mock("@/lib/watchlist", async (importOriginal) => {
    const actual = await importOriginal<typeof watchlistLib>();
    return { ...actual, useWatchlistTickers: vi.fn() };
  });

  function mkItem(id: number, ts: string, ticker: string | null = null, headline = `h${id}`) {
    return { id, ts, source: "yf", ticker, headline, body: null, url: null, is_breaking: 0 };
  }

  describe("RightRail ticker filter (RR-03)", () => {
    it("filters to My tickers via the chip, matching only watchlist symbols", () => {
      vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set(["AAPL"]));
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: {
          items: [
            mkItem(1, "2026-07-28 09:00:00", "AAPL", "aapl news"),
            mkItem(2, "2026-07-28 10:00:00", "TSLA", "tsla news"),
          ],
        },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      expect(screen.getByText("aapl news")).toBeInTheDocument();
      expect(screen.getByText("tsla news")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "My tickers" }));
      expect(screen.getByText("aapl news")).toBeInTheDocument();
      expect(screen.queryByText("tsla news")).toBeNull();
    });
  });

  describe("RightRail new-items pill (RR-03)", () => {
    it("shows an N new pill after scrolling away when new items arrive, and scroll-to-top clears it", () => {
      vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: { items: [mkItem(1, "2026-07-28 09:00:00"), mkItem(2, "2026-07-28 10:00:00")] },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      const { rerender } = render(<RightRail />);

      const aside = screen.getByLabelText("Collapse news rail").closest("aside") as HTMLElement;
      fireEvent.scroll(aside, { target: { scrollTop: 100 } });

      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: {
          items: [
            mkItem(1, "2026-07-28 09:00:00"),
            mkItem(2, "2026-07-28 10:00:00"),
            mkItem(3, "2026-07-28 11:00:00"),
          ],
        },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      rerender(<RightRail />);

      expect(screen.getByText("1 new ↑")).toBeInTheDocument();
      fireEvent.click(screen.getByText("1 new ↑"));
      expect(screen.queryByText(/new ↑/)).toBeNull();
      expect(aside.scrollTop).toBe(0);
    });
  });
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm run test:lib -- watchlist` and `npm run test:component -- RightRail`
  Expected: FAIL — `@/lib/watchlist` doesn't exist (import error); no "My tickers" button exists yet; no "N new ↑" pill exists.
- [ ] **Step 3: Write minimal implementation**
  Create `lib/watchlist.ts`:
  ```ts
  "use client";

  import useSWR from "swr";

  export interface WatchlistEntry {
    ticker: string; pinned_at: string; price_at_pin: number | null;
  }

  const fetcher = (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

  /** Set of tickers currently pinned to the watchlist, for client-side feed filtering. */
  export function useWatchlistTickers(): Set<string> {
    const { data } = useSWR<{ watchlist: WatchlistEntry[] }>("/api/watchlist", fetcher, {
      refreshInterval: 60_000, shouldRetryOnError: false,
    });
    return new Set((data?.watchlist ?? []).map((w) => w.ticker));
  }
  ```
  Replace `components/rails/RightRail.tsx` in full:
  ```tsx
  "use client";

  import Link from "next/link";
  import { useEffect, useRef, useState } from "react";
  import { AlertTriangle } from "lucide-react";
  import { useNewsFeed, relTime, sortNewsByTs, type NewsItem } from "@/lib/news";
  import { useWatchlistTickers } from "@/lib/watchlist";

  const LS_KEY = "rail-right-collapsed";
  const NARROW_QUERY = "(max-width: 1279px)";

  export function RightRail() {
    const [collapsed, setCollapsed] = useState(false);
    const [filter, setFilter] = useState<"all" | "mine">("all");
    const scrollRef = useRef<HTMLElement | null>(null);
    const [lastSeenId, setLastSeenId] = useState<number | null>(null);
    const [atTop, setAtTop] = useState(true);
    const { data } = useNewsFeed();

    useEffect(() => {
      const readStored = (): string | null => {
        try {
          return window.localStorage.getItem(LS_KEY);
        } catch {
          return null;
        }
      };

      const stored = readStored();
      if (stored === "1") setCollapsed(true);
      else if (stored === "0") setCollapsed(false);
      else setCollapsed(window.innerWidth < 1280);

      if (typeof window.matchMedia !== "function") return;
      const mql = window.matchMedia(NARROW_QUERY);
      const onChange = (e: MediaQueryListEvent) => {
        if (readStored() !== null) return;
        setCollapsed(e.matches);
      };
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }, []);

    const toggle = () => {
      setCollapsed((prev) => {
        const next = !prev;
        try {
          window.localStorage.setItem(LS_KEY, next ? "1" : "0");
        } catch {
          // ignore
        }
        return next;
      });
    };

    useEffect(() => {
      if (!data || !atTop) return;
      const max = data.items.reduce((m, i) => Math.max(m, i.id), 0);
      setLastSeenId((prev) => (prev === null || max > prev ? max : prev));
    }, [data, atTop]);

    const newCount = data && lastSeenId !== null
      ? data.items.filter((i) => i.id > lastSeenId).length
      : 0;

    const handleScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      setAtTop(el.scrollTop < 4);
    };

    const scrollToTop = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = 0;
      setAtTop(true);
    };

    if (collapsed) {
      return (
        <aside className="order-3 w-9 flex-shrink-0 flex flex-col items-center py-1 border-l border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] font-mono">
          <button
            onClick={toggle}
            aria-label="Expand news rail"
            className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
          >
            <span className="text-[14px] leading-none select-none">‹</span>
          </button>
          <span
            className="text-[9px] font-mono font-medium uppercase tracking-[0.12em] text-muted mt-4"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            NEWS
          </span>
        </aside>
      );
    }

    return (
      <aside
        ref={scrollRef as React.RefObject<HTMLElement>}
        onScroll={handleScroll}
        className="order-3 w-[260px] flex-shrink-0 bg-surface border-l border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto"
      >
        <div className="h-[24px] flex items-center justify-between px-3 border-b border-line">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
            NEWS
          </span>
          <NewsFeedHeader />
        </div>

        <div className="flex items-center gap-1 px-3 py-1 border-b border-line">
          {(["all", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded px-1.5 py-px text-[9px] font-mono font-medium leading-none ${
                filter === f ? "bg-accent/15 text-accent" : "bg-elevated text-muted hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : "My tickers"}
            </button>
          ))}
        </div>

        {newCount > 0 && !atTop && (
          <button
            onClick={scrollToTop}
            className="w-full text-center py-1 text-[9px] font-mono font-medium text-accent bg-accent/10 hover:bg-accent/15 border-b border-line"
          >
            {newCount} new ↑
          </button>
        )}

        <NewsFeedBody filter={filter} />

        <button
          onClick={toggle}
          aria-label="Collapse news rail"
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-[14px] leading-none select-none">›</span>
        </button>
      </aside>
    );
  }

  // ── Source label map ──────────────────────────────────────────────────────────
  const SOURCE_SHORT: Record<string, string> = {
    discord: "disc",
    "yahoo-finance": "yf",
    yf: "yf",
    ibkr: "ibkr",
    reuters: "reu",
    bloomberg: "bb",
    benzinga: "benz",
    twitter: "twit",
    x: "x",
    whale: "🐋",
  };

  function shortSource(s: string): string {
    return SOURCE_SHORT[s.toLowerCase()] ?? s.slice(0, 4).toLowerCase();
  }

  // ── Header right-side: item count indicator ───────────────────────────────────
  function NewsFeedHeader() {
    const { data, error } = useNewsFeed();
    if (error) return <span className="text-[9px] text-warn leading-none">offline</span>;
    if (!data) return <span className="text-[9px] text-muted opacity-40 leading-none">…</span>;
    return (
      <span className="text-[9px] text-muted leading-none">
        {data.items.length}
      </span>
    );
  }

  // ── Feed body ─────────────────────────────────────────────────────────────────
  function NewsFeedBody({ filter }: { filter: "all" | "mine" }) {
    const { data, error } = useNewsFeed();
    const watchlist = useWatchlistTickers();

    if (error) {
      return (
        <p className="flex items-center gap-1.5 text-[11px] text-warn px-3 pt-3 leading-relaxed">
          <AlertTriangle size={12} strokeWidth={2} className="flex-shrink-0" />
          news feed offline
        </p>
      );
    }

    if (!data) {
      return (
        <div className="px-3 pt-4 flex flex-col gap-3">
          <div className="h-3 bg-elevated rounded animate-pulse" style={{ width: "70%" }} />
          <div className="h-3 bg-elevated rounded animate-pulse" style={{ width: "55%" }} />
          <div className="h-3 bg-elevated rounded animate-pulse" style={{ width: "80%" }} />
        </div>
      );
    }

    const sorted = sortNewsByTs(data.items);
    const items = filter === "mine" ? sorted.filter((i) => i.ticker && watchlist.has(i.ticker)) : sorted;

    if (items.length === 0) {
      return (
        <p className="text-[11px] text-muted opacity-70 px-3 pt-3 leading-relaxed">
          {filter === "mine"
            ? "no watchlist tickers in the feed yet"
            : "no news yet — feed starts when the ingest service runs"}
        </p>
      );
    }

    return (
      <div>
        {items.map((item: NewsItem) => (
          <NewsRow key={item.id} item={item} />
        ))}
      </div>
    );
  }

  // ── Individual news row ───────────────────────────────────────────────────────
  function NewsRow({ item }: { item: NewsItem }) {
    const isBreaking = Boolean(item.is_breaking);
    const isWhale = item.source === "whale";

    return (
      <div
        className={[
          "px-3 py-1.5 border-b border-line/50",
          isBreaking ? "border-l-2 border-neg pl-2" : "",
          isWhale && !isBreaking ? "border-l-2 border-teal pl-2" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          {isBreaking && (
            <span className="text-[9px] font-medium text-neg mr-1 leading-none">
              BREAKING
            </span>
          )}
          <span className="text-[9px] text-muted leading-none">
            {relTime(item.ts)}
          </span>
          <span className="text-[9px] text-muted uppercase leading-none">
            {shortSource(item.source)}
          </span>
          {item.ticker && (
            <Link
              href={`/t/${item.ticker}`}
              className="text-[10px] text-accent leading-none ml-auto"
            >
              {item.ticker}
            </Link>
          )}
        </div>

        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-foreground leading-snug line-clamp-3 block"
          >
            {item.headline}
          </a>
        ) : (
          <p className="text-[12px] text-foreground leading-snug line-clamp-3">
            {item.headline}
          </p>
        )}
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:lib -- watchlist` and `npm run test:component -- RightRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add lib/watchlist.ts lib/__tests__/watchlist.test.ts components/rails/RightRail.tsx components/rails/__tests__/RightRail.test.tsx
  git commit -m "feat(right-rail): All/My tickers filter chips and N-new scroll-to-top pill"
  ```

---

### Task 25: NewsRow — replace the whale emoji with a text code
**Files:**
- Modify: `components/rails/RightRail.tsx` (`SOURCE_SHORT` map, as it stands after Task 24)
- Test: `components/rails/__tests__/RightRail.test.tsx`

**Interfaces:**
- `SOURCE_SHORT.whale` changes from `"🐋"` to `"WHL"` — the existing teal `border-l-2 border-teal` treatment on whale rows (already present, untouched) remains the sole whale indicator alongside the text code, matching the "lucide glyph or a text code" convention used by every other source.

**Audit findings closed:** RR-04

- [ ] **Step 1: Write the failing test**
  Append to `components/rails/__tests__/RightRail.test.tsx`:
  ```tsx
  describe("NewsRow whale source (RR-04)", () => {
    it("renders the WHL text code instead of the whale emoji", () => {
      vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: { items: [mkItem(1, "2026-07-28 09:00:00", null, "big print")] },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: {
          items: [{ id: 1, ts: "2026-07-28 09:00:00", source: "whale", ticker: null, headline: "big print", body: null, url: null, is_breaking: 0 }],
        },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      expect(screen.getByText("whl")).toBeInTheDocument();
      expect(screen.queryByText("🐋")).toBeNull();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- RightRail`
  Expected: FAIL — `shortSource("whale")` still returns `"🐋"`; rendered uppercase via CSS (`uppercase` class doesn't change the text node, `getByText("whl")` matches the lowercase text content `"🐋"` fails since it's not `"whl"`.
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/RightRail.tsx`, change the `SOURCE_SHORT.whale` entry:
  ```tsx
    whale: "whl",
  ```
- [ ] **Step 4: Run test to verify it passes**
  Run: `npm run test:component -- RightRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/RightRail.tsx components/rails/__tests__/RightRail.test.tsx
  git commit -m "fix(news-feed): WHL text code instead of whale emoji, matching text-code source convention"
  ```

---

### Task 26: NewsRow headlines — add `title` attribute so clamped text has an escape
**Files:**
- Modify: `components/rails/RightRail.tsx` (`NewsRow`, as it stands after Task 25)
- Test: `components/rails/__tests__/RightRail.test.tsx`

**Interfaces:**
- Both the linked (`<a>`) and unlinked (`<p>`) headline elements in `NewsRow` gain `title={item.headline}` — a truncated `line-clamp-3` headline is now recoverable via native tooltip even when the item has no `url` to click through to.

**Audit findings closed:** RR-05

- [ ] **Step 1: Write the failing test**
  Append to `components/rails/__tests__/RightRail.test.tsx`:
  ```tsx
  describe("NewsRow headline title attribute (RR-05)", () => {
    it("gives the clamped headline a title attribute with the full text, url or not", () => {
      vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
      const longHeadline = "A very long headline that would be clamped at three lines in the 260px rail";
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: {
          items: [
            { id: 1, ts: "2026-07-28 09:00:00", source: "yf", ticker: null, headline: longHeadline, body: null, url: null, is_breaking: 0 },
            { id: 2, ts: "2026-07-28 10:00:00", source: "yf", ticker: null, headline: "linked " + longHeadline, body: null, url: "https://example.com", is_breaking: 0 },
          ],
        },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      expect(screen.getByText(longHeadline)).toHaveAttribute("title", longHeadline);
      expect(screen.getByText("linked " + longHeadline)).toHaveAttribute("title", "linked " + longHeadline);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- RightRail`
  Expected: FAIL — neither the `<p>` nor the `<a>` headline element currently has a `title` attribute.
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/RightRail.tsx`, update `NewsRow`'s headline block:
  ```tsx
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              title={item.headline}
              className="text-[12px] text-foreground leading-snug line-clamp-3 block"
            >
              {item.headline}
            </a>
          ) : (
            <p title={item.headline} className="text-[12px] text-foreground leading-snug line-clamp-3">
              {item.headline}
            </p>
          )}
  ```
- [ ] **Step 4: Run test to verify it passes**
  Run: `npm run test:component -- RightRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/RightRail.tsx components/rails/__tests__/RightRail.test.tsx
  git commit -m "fix(news-feed): title attribute on clamped headlines as a text-recovery escape hatch"
  ```

---

### Task 27: NewsRow ticker link — pad to a 24px hit area
**Files:**
- Modify: `components/rails/RightRail.tsx` (`NewsRow`, as it stands after Task 26)
- Test: `components/rails/__tests__/RightRail.test.tsx`

**Interfaces:**
- The per-row ticker `<Link>` gains `-my-1.5 py-1.5 px-1` (vertical negative-margin/padding trick to grow the tap target to ~24px tall without changing the row's visual line-height or shifting adjacent text), replacing the current bare `text-[10px] ... ml-auto` with no padding.

**Audit findings closed:** RR-06

- [ ] **Step 1: Write the failing test**
  Append to `components/rails/__tests__/RightRail.test.tsx`:
  ```tsx
  describe("NewsRow ticker link hit area (RR-06)", () => {
    it("pads the ticker link beyond the bare 10px text for a comfortable tap target", () => {
      vi.mocked(watchlistLib.useWatchlistTickers).mockReturnValue(new Set());
      vi.mocked(newsLib.useNewsFeed).mockReturnValue({
        data: { items: [{ id: 1, ts: "2026-07-28 09:00:00", source: "yf", ticker: "AAPL", headline: "h", body: null, url: null, is_breaking: 0 }] },
        error: undefined,
      } as ReturnType<typeof newsLib.useNewsFeed>);
      render(<RightRail />);
      const link = screen.getByRole("link", { name: "AAPL" });
      expect(link.className).toContain("py-1.5");
      expect(link.className).toContain("px-1");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- RightRail`
  Expected: FAIL — the ticker `<Link>`'s className has no `py-1.5`/`px-1`.
- [ ] **Step 3: Write minimal implementation**
  In `components/rails/RightRail.tsx`, replace the ticker `<Link>` inside `NewsRow`:
  ```tsx
          {item.ticker && (
            <Link
              href={`/t/${item.ticker}`}
              className="text-[10px] text-accent leading-none ml-auto -my-1.5 py-1.5 px-1"
            >
              {item.ticker}
            </Link>
          )}
  ```
- [ ] **Step 4: Run test to verify it passes**
  Run: `npm run test:component -- RightRail`  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add components/rails/RightRail.tsx components/rails/__tests__/RightRail.test.tsx
  git commit -m "fix(news-feed): pad ticker link to a ~24px hit area"
  ```

---

## Audit findings that did not hold up

**Contract §F migration table vs. `QuoteRow.tsx`'s own documented spec (X-08-adjacent format duplication).** The foundations contract's format-helper migration table (`00-foundations-contract.md` lines 1005–1006) lists `components/rails/QuoteRow.tsx`'s `formatPrice()`/`formatPct()` as call sites that should migrate to the shared `format.price()`/`format.pct()` helpers (`00-foundations-contract.md` lines 741–760). On inspection this migration is not safe and no task in this plan performs it:
- The contract's `format.price(v)` is unconditionally `$${v.toFixed(2)}` — a fixed `$X.XX`, 2 decimal places, always.
- `QuoteRow.tsx`'s local `formatPrice(symbol, price)` (lines 14–35, docblock: `"Format price per spec: forex 4dp, ≥1000 thousands-separated no decimals, others 2dp."`) is symbol-aware: 4 decimal places with **no** `$` prefix for FX pairs (`EURUSD=X` etc.), 0 decimals for prices ≥1000, and only falls back to 2dp for the remaining case.

  Migrating `QuoteRow` to `format.price()` would render `EURUSD=X` as `$1.09` (losing 2 of 4 significant decimals a forex trader needs) and a $2,410 equity as `$2410.00` instead of `2,410` (adding a stray `$` and false precision the rail's own spec explicitly rejects for large values). This is a real, intentional divergence driven by `QuoteRow`'s own in-file contract, not an oversight — no Phase 2 task touches this migration, and none should.
- Same story for `formatPct`: the contract's `format.pct(v, unit)` is 1dp always-signed with a `%` suffix; `QuoteRow`'s local `formatPct` (not reproduced above, confirmed in the prior session) intentionally differs to match the rail's compact display grammar.

No task closes this pairing; it is flagged here rather than silently ignored, per the resilience directive.

**Original task-brief citation "X-08 (locale/timezone)" is mislabeled — the real ID is X-03.** `MARKET_ANALYSE_UI_AUDIT.md` line 421 shows **X-03 · P1 · Four locales, no timezones** (`en-NZ` in `app/page.tsx`, `en-AU` in `CatalystStrip`, `en-US` in `QuoteRow`, runtime-default elsewhere; fix: one locale + one display-timezone setting via the already-existing `lib/tz-display.ts` hook point). `X-08` (line 431) is a **different, unrelated finding** about ad hoc number-precision helpers (`round(x*100)` in `WhyPanel`, `format.ts`) — it has nothing to do with locale or timezones. Within chrome/rail scope, the only X-03 call site is `QuoteRow.tsx`'s `en-US` `toLocaleString` calls, which already match the contract's canonical locale choice (`en-US`, confirmed in the format-helpers block above) — so there is no in-scope X-03 violation to fix here; the actual violations (`en-NZ` in `app/page.tsx`, `en-AU` in `CatalystStrip`) live in the Today page body and Ticker page body, both explicitly out of scope for this plan.

---

## Coverage table

| ID | Closed by | Notes |
|---|---|---|
| G-01 | Task 1 | `/macro` added to `NavLinks.LINKS` |
| G-02 | Task 5 | persistent `?` affordance in `NavActions` |
| G-03 | Task 3 | bare `g` binding removed from `CommandK` |
| G-04 | Task 4 | recents + action commands, default palette state |
| G-05 | Task 6 | shared `useMarketClock()` 30s-tick hook |
| G-06 | Task 8 | SYS pill becomes a keyboard-reachable Popover button |
| G-07 | Task 9 | "bridge HH:MM · quotes Ns ago" freshness label in `ContextStrip` |
| G-08 | Task 10 | `PageShell` primitive built (partial — per-page adoption is each page's own future phase; out of scope here) |
| G-09 | Task 10 | `PageShell` exposes two width tokens ("reading"/"dense") |
| G-10 | — | `PageHeader` mandate is page-body adoption work across Watchlist/Screener/Portfolio/Alerts/Today/Rotation/odte/Macro — out of scope (page bodies), mirrors the user's explicit G-14 deferral |
| G-11 | Tasks 11, 12, 22 | skip link + `#main` (Task 11), `order-1` on `LeftRail` (Task 12), `order-3` on `RightRail` (Task 22) |
| G-12 | Task 1 | `aria-current="page"` on the active `NavLinks` entry |
| G-13 | Task 7 | `visibilityAwareInterval()` wired into `ContextStrip` + all four rail data hooks |
| G-14 | — | explicitly deferred by the user; no task may touch the Settings page |
| LR-01 | Task 12 | `LeftRail` gains `RightRail`'s `matchMedia` self-collapse behavior |
| LR-02 | Task 13 | offline banner hoisted to one rail-level banner |
| LR-03 | Task 14 | `QuoteRow` (non-skeleton) becomes a `next/link` to `/t/[symbol]` |
| LR-04 | Task 15 | collapsed-strip glyph indicators for the three hidden blocks |
| LR-05 | Task 16 | `MacroGauges` + collapse control pinned as a non-scrolling footer |
| LR-06 | Tasks 17, 18, 20 | `Block` separator → `border-line-strong` (17); `MacroGauges` wrapper border (18); `EconCalendar` wrapper border (20) |
| LR-07 | Task 18 | `toneClass`/`Gauge` fill → `bg-pos`/`bg-neg`, not `bg-accent`/`bg-warn` |
| LR-08 | Task 19 | `FxChip` single `FX · {STATE}` label, one tone; session legend added to `HelpOverlay` |
| LR-09 | Task 20 | "+N more" footer link to `/macro`; importance dot legend |
| LR-10 | Task 21 | `time_et` and "building…" move to 10px + `text-muted-2` token, dropping `opacity-60` |
| RR-01 | Task 22 | amber+icon failure state, distinct from muted quiet state, in both `NewsFeedBody` and `NewsFeedHeader` |
| RR-02 | Task 23 | `sortNewsByTs()` replaces blind `.reverse()` |
| RR-03 | Task 24 | All/My tickers filter chips + "N new ↑" scroll-to-top pill |
| RR-04 | Task 25 | `SOURCE_SHORT.whale` → `"whl"` text code |
| RR-05 | Task 26 | `title={item.headline}` on both headline variants |
| RR-06 | Task 27 | ticker `<Link>` padded to a ~24px hit area |
| A11Y-02 | Task 21 (partial) | only the two instances LR-10 names (`EconCalendar` `time_et`, `MacroGauges` empty state) — `MiniItem` labels, rail block badges, and `NewsRow`'s 9px meta line are the same pattern but aren't named by any LR-xx/RR-xx/G-xx ID, so a full type-scale sweep is out of this plan's scope |
| A11Y-03 | Tasks 19, 20 (partial) | FX session tints (19) and econ importance dots (20) closed; quadrant dots and GEX bar sign live on the Today/Options page bodies — out of scope |
| A11Y-04 | Task 24 (partial) | new filter chips ship with `aria-pressed` from the start; EMA/log/HC-only toggles and the broader toggle sweep are page-body work — out of scope |
| A11Y-05 | Task 11 | same skip-link fix as G-11 |
| A11Y-06 | — | bespoke tables needing `scope`/`caption` are all page-body (Rotation, Portfolio, OptionsPanel, HistoryCard, strikes ladder) — out of scope, no chrome/rail table exists |
| A11Y-07 | — | destructive-action confirmation (unpin, delete rule) lives on Watchlist/Alerts page bodies, not chrome/rails — out of scope |
| X-01 | — | whole-product design-language divergence (`Market_Review` vs. Argus tooling) — not a chrome/rail component fix, out of scope |
| X-02 | — | third/fourth palette lives in `argus/argus/ui/index.html` and `CandleChart` (Ticker page body) — out of scope |
| X-03 | — | not applicable in-scope: `QuoteRow`'s `en-US` already matches the contract's canonical locale; the actual violations (`en-NZ`, `en-AU`, runtime-default) are on the Today/Ticker/Alerts/Portfolio/Watchlist page bodies — out of scope. (Original brief's "X-08" citation for this topic is corrected here — X-08 is unrelated number-precision, see above.) |
| X-04 | — | three pin affordances (`PinButton`, `PinCell`, watchlist unpin) are all page-body components — out of scope |
| X-05 | — | four collapsible implementations (`Panel`, `DiffStrip`, `VerdictCard`, `WhyPanel`) are shared-primitive/page-body consolidation — out of scope for this phase |
| X-06 | — | five table implementations are all page-body — out of scope |
| X-07 | Task 2 | `CommandK` now consumes `lib/groups.ts`'s `deriveGroup`/`GROUP_LABEL` instead of re-deriving group logic inline |
| X-08 | — | ad hoc number-precision helpers (`WhyPanel`'s `round(x*100)`, `format.ts`) are page-body/Phase-1-primitive concerns; see "Audit findings that did not hold up" for why `QuoteRow`'s local formatters are intentionally not migrated |
