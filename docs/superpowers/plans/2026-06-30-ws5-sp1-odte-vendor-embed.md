# WS-5 SP1 — Vendor + Minimal Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a `/odte` route in the Next.js dashboard that embeds the vendored `~/OptionsAnalysis` QQQ 0DTE ladder via iframe, backed by a supervised local FastAPI service, with a live/down health badge.

**Architecture:** One-time copy of `~/OptionsAnalysis` → `Market_Analyse/odte/`; its FastAPI (which already serves its own built UI + `/stream` websocket + `/health`) runs supervised by launchd on `127.0.0.1:8788`. The dashboard frames `http://127.0.0.1:8788/app` and overlays a badge fed by a Next health-proxy route. The vendored frontend builds its websocket URL from `window.location.host`, so framing the backend's `/app` needs **zero** frontend edits.

**Tech Stack:** Python 3.11 / FastAPI / uvicorn (vendored backend) · React + Vite (vendored frontend, prebuilt `dist`) · Next.js 14 App Router + SWR + Tailwind (dashboard) · launchd (supervision) · vitest (pure-lib unit tests) · Playwright (smoke screenshots).

## Global Constraints

- **Backend port `8788`** — dedicated; do not collide with OptionsAnalysis default `8000` or the Argus API `8088`.
- **Vendored internals are opaque** — no edits to `odte/` source except the single documented framing-contingency middleware in Task 6 (only if cross-port framing is actually blocked).
- **Commit the built `odte/frontend/dist`**; gitignore `odte/frontend/node_modules` and `odte/backend/.venv` (runtime needs no Node build; the Python venv is provisioned once on the box).
- **Badge copy, exact strings:** `Live` · `IBKR disconnected` · `Service down`.
- **launchd:** follow the existing house style (`ai.argus.api.plist`); label `com.argus.odte`; logs under `Market_Analyse/logs/`.
- **Tests:** vitest is node-env, pure-lib only (`dashboard/lib/__tests__/*.test.ts`); there is **no** `@testing-library` — do not write React component tests. Route/page/iframe are verified via `curl` + the `scripts/smoke.mjs` Playwright harness.
- **Naming:** route `/odte`, health proxy `/api/odte/health`, helper `lib/odte.ts`.

---

### Task 1: Vendor OptionsAnalysis into `odte/` with provenance

**Files:**
- Create: `odte/` (copied tree: `odte/backend/…`, `odte/frontend/…`)
- Create: `odte/VENDOR.md`
- Modify: `.gitignore` (append odte artifact ignores)

**Interfaces:**
- Produces: a vendored tree whose backend entrypoint is `odte/backend/app/main.py` (`create_app` factory) and whose frontend source is `odte/frontend/`. Later tasks rely on these paths.

- [ ] **Step 1: Record the source commit hash**

Run:
```bash
git -C ~/OptionsAnalysis rev-parse HEAD
git -C ~/OptionsAnalysis log -1 --format='%h %ci %s'
```
Note the full hash for the next step.

- [ ] **Step 2: Copy the app, excluding VCS/build/venv/junk**

Run from `~/Market_Analyse`:
```bash
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.venv' --exclude '.venv-desktop-build' \
  --exclude 'dist' --exclude 'build' --exclude '.pytest_cache' --exclude '.DS_Store' \
  ~/OptionsAnalysis/ ~/Market_Analyse/odte/
```

- [ ] **Step 3: Write `odte/VENDOR.md`**

```markdown
# Vendored: OptionsAnalysis

Source: ~/OptionsAnalysis
Commit: <FULL_HASH_FROM_STEP_1>
Vendored: 2026-06-30
Reason: WS-5 SP1 — embed the QQQ 0DTE ladder into the Market_Analyse dashboard.

## Rules
- Treat this tree as OPAQUE. Do not edit internals.
- To update: re-run the rsync copy from the source repo and bump Commit/Vendored above.
- Build artifacts: `frontend/dist` is committed; `frontend/node_modules` and `backend/.venv` are gitignored and provisioned on the box.
```

- [ ] **Step 4: Append ignores to root `.gitignore`**

Add:
```gitignore
# WS-5 vendored 0DTE app — runtime-provisioned artifacts
odte/frontend/node_modules/
odte/backend/.venv/
odte/**/__pycache__/
odte/**/.pytest_cache/
```

- [ ] **Step 5: Verify the tree landed**

Run:
```bash
test -f odte/backend/app/main.py && test -f odte/frontend/package.json && test -f odte/VENDOR.md && echo OK
grep -c '<FULL_HASH' odte/VENDOR.md   # expect 0 — placeholder must be replaced; confirm real hash present:
grep -E 'Commit: [0-9a-f]{7,40}' odte/VENDOR.md
```
Expected: `OK`, and the `Commit:` line shows a real hex hash.

- [ ] **Step 6: Commit**

```bash
git add odte .gitignore
git commit -m "feat(odte): vendor OptionsAnalysis QQQ 0DTE app (WS-5 SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Provision backend venv, build & commit the frontend dist, smoke standalone

**Files:**
- Create: `odte/backend/.venv/` (gitignored)
- Create: `odte/frontend/dist/` (committed)

**Interfaces:**
- Consumes: vendored tree from Task 1.
- Produces: a runnable backend (`odte/backend/.venv/bin/python -m uvicorn app.main:create_app --factory`) that serves `/app`, `/assets`, `/health`, `/stream` once `OPTIONS_FRONTEND_DIST_DIR` points at `odte/frontend/dist`. Task 3 (plist) and Task 5 (health proxy) depend on this contract.

- [ ] **Step 1: Create the backend venv and install deps**

Run from `~/Market_Analyse/odte/backend`:
```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
.venv/bin/python -c "import uvicorn, fastapi; print('deps-ok')"
```
Expected: ends with `deps-ok`.

- [ ] **Step 2: Build the frontend bundle**

Run from `~/Market_Analyse/odte/frontend`:
```bash
npm ci
npm run build
```
Expected: a new `dist/` directory.

- [ ] **Step 3: Verify the build references absolute `/assets/`**

Run from `~/Market_Analyse/odte/frontend`:
```bash
test -f dist/index.html && echo index-ok
grep -oE '(src|href)="/assets/[^"]+"' dist/index.html | head
```
Expected: `index-ok`, and asset references begin with `/assets/` (so the backend's `/assets` mount serves them). If they are relative (`./assets/`), the `dist` will not resolve under the `/app` mount — stop and check `odte/frontend/vite.config.ts` `base` (must be `/`, the default).

- [ ] **Step 4: Smoke the backend standalone on :8788**

Run from `~/Market_Analyse/odte/backend`:
```bash
OPTIONS_FRONTEND_DIST_DIR="$HOME/Market_Analyse/odte/frontend/dist" \
  .venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8788 &
SERVER_PID=$!
sleep 4
curl -s http://127.0.0.1:8788/health
echo
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8788/app
kill $SERVER_PID
```
Expected: health prints JSON like `{"ok":true,"server_ts_ms":…,"ibkr_connected":false,"subscriptions":0}` (IBKR false is fine — Gateway is down), and `/app` returns `200`.

- [ ] **Step 5: Commit the built dist**

```bash
cd ~/Market_Analyse
git add -f odte/frontend/dist
git commit -m "build(odte): commit prebuilt frontend dist for runtime-dependency-free boot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(`-f` because Task 1 may have added a broad `dist/` ignore elsewhere; this path is intentionally committed.)

---

### Task 3: launchd supervision — `com.argus.odte.plist`

**Files:**
- Create: `scripts/com.argus.odte.plist`

**Interfaces:**
- Consumes: the runnable backend + dist from Task 2.
- Produces: an always-on service on `127.0.0.1:8788` with `KeepAlive`, surviving crashes. Task 5/6 assume the service is reachable.

- [ ] **Step 1: Write the plist (mirrors `ai.argus.api.plist` house style)**

Create `scripts/com.argus.odte.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.argus.odte</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/josephstorey/Market_Analyse/odte/backend/.venv/bin/python</string>
        <string>-m</string>
        <string>uvicorn</string>
        <string>app.main:create_app</string>
        <string>--factory</string>
        <string>--host</string>
        <string>127.0.0.1</string>
        <string>--port</string>
        <string>8788</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/josephstorey/Market_Analyse/odte/backend</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>OPTIONS_FRONTEND_DIST_DIR</key>
        <string>/Users/josephstorey/Market_Analyse/odte/frontend/dist</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/josephstorey/Market_Analyse/logs/odte.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/josephstorey/Market_Analyse/logs/odte_error.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Install and load the service**

Run:
```bash
mkdir -p ~/Market_Analyse/logs
cp ~/Market_Analyse/scripts/com.argus.odte.plist ~/Library/LaunchAgents/com.argus.odte.plist
launchctl bootout gui/$(id -u)/com.argus.odte 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.argus.odte.plist
launchctl kickstart -k gui/$(id -u)/com.argus.odte
```

- [ ] **Step 3: Verify the supervised service answers**

Run:
```bash
sleep 4
launchctl print gui/$(id -u)/com.argus.odte | grep -E 'state =|pid ='
curl -s -o /dev/null -w 'health %{http_code}\n' http://127.0.0.1:8788/health
curl -s -o /dev/null -w 'app %{http_code}\n'    http://127.0.0.1:8788/app
```
Expected: state `running`, a pid, `health 200`, `app 200`.

- [ ] **Step 4: Verify KeepAlive restarts it**

Run:
```bash
PID=$(launchctl print gui/$(id -u)/com.argus.odte | awk '/pid =/{print $3}')
kill "$PID"; sleep 5
curl -s -o /dev/null -w 'after-kill %{http_code}\n' http://127.0.0.1:8788/health
```
Expected: `after-kill 200` (launchd relaunched it).

- [ ] **Step 5: Commit**

```bash
git add scripts/com.argus.odte.plist
git commit -m "feat(odte): launchd service com.argus.odte on 127.0.0.1:8788

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Health-status helper `lib/odte.ts` (pure, TDD)

**Files:**
- Create: `dashboard/lib/odte.ts`
- Test: `dashboard/lib/__tests__/odte.test.ts`

**Interfaces:**
- Produces:
  - `interface OdteHealth { ok: boolean; ibkr_connected: boolean; subscriptions?: number; server_ts_ms?: number }`
  - `type OdteTone = "live" | "warn" | "down"`
  - `interface OdteBadge { label: string; tone: OdteTone }`
  - `function odteBadge(health: OdteHealth | null | undefined): OdteBadge`
- Task 6's page imports `odteBadge` and `OdteHealth`.

- [ ] **Step 1: Write the failing test**

Create `dashboard/lib/__tests__/odte.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { odteBadge } from "@/lib/odte";

describe("odteBadge", () => {
  it("Live when ok and ibkr connected", () => {
    expect(odteBadge({ ok: true, ibkr_connected: true })).toEqual({ label: "Live", tone: "live" });
  });
  it("IBKR disconnected when ok but ibkr down", () => {
    expect(odteBadge({ ok: true, ibkr_connected: false })).toEqual({ label: "IBKR disconnected", tone: "warn" });
  });
  it("Service down when ok is false", () => {
    expect(odteBadge({ ok: false, ibkr_connected: false })).toEqual({ label: "Service down", tone: "down" });
  });
  it("Service down when health is null (proxy failed)", () => {
    expect(odteBadge(null)).toEqual({ label: "Service down", tone: "down" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `~/Market_Analyse/dashboard`:
```bash
npx vitest run lib/__tests__/odte.test.ts
```
Expected: FAIL — cannot resolve `@/lib/odte`.

- [ ] **Step 3: Write the minimal implementation**

Create `dashboard/lib/odte.ts`:
```ts
export interface OdteHealth {
  ok: boolean;
  ibkr_connected: boolean;
  subscriptions?: number;
  server_ts_ms?: number;
}

export type OdteTone = "live" | "warn" | "down";

export interface OdteBadge {
  label: string;
  tone: OdteTone;
}

export function odteBadge(health: OdteHealth | null | undefined): OdteBadge {
  if (!health || !health.ok) return { label: "Service down", tone: "down" };
  if (!health.ibkr_connected) return { label: "IBKR disconnected", tone: "warn" };
  return { label: "Live", tone: "live" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `~/Market_Analyse/dashboard`:
```bash
npx vitest run lib/__tests__/odte.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Market_Analyse
git add dashboard/lib/odte.ts dashboard/lib/__tests__/odte.test.ts
git commit -m "feat(odte): odteBadge health-status helper + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Health-proxy route `app/api/odte/health/route.ts`

**Files:**
- Create: `dashboard/app/api/odte/health/route.ts`

**Interfaces:**
- Consumes: the supervised backend `/health` (Task 3).
- Produces: `GET /api/odte/health` → passes through the backend health JSON + status, or `{ ok: false, error }` with `503` when the service is unreachable. Task 6 fetches this.

- [ ] **Step 1: Write the route (mirrors `app/api/argus/health/route.ts`)**

Create `dashboard/app/api/odte/health/route.ts`:
```ts
export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:8788/health", { next: { revalidate: 0 } });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ ok: false, error: "0DTE service offline" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify against the running service**

With `com.argus.odte` running (Task 3), run from `~/Market_Analyse/dashboard`:
```bash
npm run dev >/tmp/odte-next-dev.log 2>&1 &
NEXT_PID=$!
sleep 6
curl -s http://localhost:3000/api/odte/health
echo
kill $NEXT_PID
```
Expected: the same JSON the backend `/health` returns (`"ok":true,…,"ibkr_connected":false`). If the backend is stopped, expect `{"ok":false,"error":"0DTE service offline"}` with HTTP 503.

- [ ] **Step 3: Commit**

```bash
cd ~/Market_Analyse
git add dashboard/app/api/odte/health/route.ts
git commit -m "feat(odte): /api/odte/health proxy to the 0DTE service

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `/odte` page (iframe + badge), nav link, smoke route

**Files:**
- Create: `dashboard/app/odte/page.tsx`
- Modify: `dashboard/components/NavLinks.tsx`
- Modify: `dashboard/scripts/smoke.mjs`

**Interfaces:**
- Consumes: `odteBadge`, `OdteHealth` (Task 4); `/api/odte/health` (Task 5); backend `/app` (Task 3).
- Produces: the user-facing `/odte` route. Terminal deliverable of SP1.

- [ ] **Step 1: Write the page**

Create `dashboard/app/odte/page.tsx`:
```tsx
"use client";

import useSWR from "swr";
import { odteBadge, type OdteHealth } from "@/lib/odte";

const ODTE_APP_URL = "http://127.0.0.1:8788/app";
const fetcher = (u: string) => fetch(u, { cache: "no-store" }).then((r) => r.json());
const toneClass: Record<string, string> = {
  live: "bg-green-500/20 text-green-400",
  warn: "bg-yellow-500/20 text-yellow-400",
  down: "bg-red-500/20 text-red-400",
};

export default function OdtePage() {
  const { data, error } = useSWR<OdteHealth>("/api/odte/health", fetcher, {
    refreshInterval: 5000,
    shouldRetryOnError: false,
  });
  const health = error ? null : data;
  const badge = odteBadge(health);
  const down = badge.tone === "down";

  return (
    <main className="flex flex-col font-mono h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line">
        <h1 className="text-sm font-semibold">Index 0DTE · QQQ</h1>
        <span className={`px-2 py-0.5 text-xs rounded ${toneClass[badge.tone]}`}>{badge.label}</span>
      </div>
      <div className="relative flex-1 min-h-0">
        {down ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            Ladder offline — 0DTE service not reachable.
          </div>
        ) : (
          <iframe src={ODTE_APP_URL} title="0DTE ladder" className="w-full h-full border-0" />
        )}
      </div>
    </main>
  );
}
```
Note: `h-[calc(100vh-3.5rem)]` assumes the ~56px nav. If `RailShell` wraps children and clips the iframe, switch the `main` to `h-full` and let the shell own the height.

- [ ] **Step 2: Add the nav link**

In `dashboard/components/NavLinks.tsx`, change the `LINKS` array to include `0DTE` after `Watchlist`:
```ts
const LINKS = [
  { href: "/", label: "Today" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/odte", label: "0DTE" },
  { href: "/performance", label: "Performance" },
  { href: "/sources", label: "Sources" },
  { href: "/screener", label: "Screener" },
] as const;
```

- [ ] **Step 3: Add `/odte` to the smoke harness**

In `dashboard/scripts/smoke.mjs`, add to the routes array (after the `/watchlist` entry):
```js
  { path: "/odte", label: "odte" },
```
and add to `ACCEPTABLE_FAIL_PREFIXES` (the iframe's cross-origin `:8788` calls and the health proxy may 503 when IBKR/Gateway is down):
```js
  "/api/odte/health",
```

- [ ] **Step 4: Typecheck / build the dashboard**

Run from `~/Market_Analyse/dashboard`:
```bash
npm run build
```
Expected: build succeeds (the `/odte` route compiles, no type errors).

- [ ] **Step 5: Manual integration check — the framing-risk flush**

With `com.argus.odte` running, run from `~/Market_Analyse/dashboard`:
```bash
npm run dev >/tmp/odte-next-dev.log 2>&1 &
NEXT_PID=$!
sleep 6
node scripts/smoke.mjs   # visits /odte among others; writes .smoke/odte.png
kill $NEXT_PID
```
Then open `dashboard/.smoke/odte.png` (or load `http://localhost:3000/odte` in a browser) and confirm the ladder renders inside the frame and the badge shows `IBKR disconnected` (Gateway down overnight) or `Live` (Gateway up).

**Framing contingency (only if the iframe is blank / blocked by the browser):** the vendored FastAPI sets no `X-Frame-Options` by default, so this should not happen. If it does, add a single response-header middleware to `odte/backend/app/main.py` (the one sanctioned edit, record it in `VENDOR.md`):
```python
@app.middleware("http")
async def _allow_dashboard_framing(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = "frame-ancestors 'self' http://localhost:3000"
    response.headers.pop("X-Frame-Options", None)
    return response
```
Re-run the check. Rebuild not required (backend-only change); `launchctl kickstart -k gui/$(id -u)/com.argus.odte` to pick it up.

- [ ] **Step 6: Commit**

```bash
cd ~/Market_Analyse
git add dashboard/app/odte/page.tsx dashboard/components/NavLinks.tsx dashboard/scripts/smoke.mjs dashboard/.smoke/odte.png
git commit -m "feat(odte): /odte route — embed QQQ ladder iframe + health badge + nav (WS-5 SP1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Vendor + provenance → Task 1 ✓
- Supervised FastAPI on 8788 (UI + ws + health) → Tasks 2–3 ✓
- iframe embed of `/app` → Task 6 ✓
- Health badge fed by Next proxy mirroring `argus/health` → Tasks 4–5 ✓
- Offline state (IBKR disconnected / service down, no persistence) → `odteBadge` warn/down + offline overlay, Tasks 4 & 6 ✓
- Cross-port framing risk + contingency → Task 6 Step 5 ✓
- Testing (service smoke, health states, isolation; vendored tests not in dashboard suite) → Tasks 2/3 smoke, Task 4 unit, smoke.mjs ✓
- Out-of-scope (multi-underlying, companions, persistence, ladder edits) → not present ✓

**Placeholder scan:** `<FULL_HASH_FROM_STEP_1>` in Task 1 is an intentional fill-in with an explicit replace-and-verify step (Step 5); no other TBD/vague steps.

**Type consistency:** `odteBadge` / `OdteHealth` / `OdteTone` defined in Task 4 are consumed with the same names/shape in Task 6. Health JSON fields (`ok`, `ibkr_connected`) match the backend `HealthResponse` schema and the proxy passthrough.

**Note (left to implementation):** the vendored backend's Python deps are provisioned once via the venv in Task 2; this is environment setup, not an abstraction. No speculative Argus generalisation is introduced (per the spec's non-binding future-direction note).
