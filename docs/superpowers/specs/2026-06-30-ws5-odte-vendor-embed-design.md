# WS-5 Index 0DTE Hub · Sub-project 1 — Vendor + Minimal Embed — Design

**Date:** 2026-06-30 · **Status:** design approved, awaiting plan.
**Part of:** [2026-06-12-platform-v2-master-plan.md](../plans/2026-06-12-platform-v2-master-plan.md) (WS-5)

## Goal

Stand up the `/odte` route in the dashboard by **vendoring** the existing `~/OptionsAnalysis`
0DTE ladder (don't rebuild it) and embedding its UI inside the Next.js shell, backed by a
supervised local service. v1 scope = the existing **QQQ** ladder, running and embedded, with a
live/down health badge. This is the foundation the rest of WS-5 (multi-underlying, WS-1 companion
panels) builds on; it exists to flush out the real integration risks of running a separate
Vite + FastAPI app inside the Next dashboard before any feature work is invested.

## Background / decisions

- **Decomposition** (user-chosen): WS-5 splits into SP1 vendor+embed (this doc) → SP2
  multi-underlying → SP3 WS-1 companion 2×2 grid. Each gets its own spec → plan → build cycle.
- **Embed = iframe the built Vite app** (user-chosen): the vendored FastAPI already serves its
  own built UI (`app.mount("/assets", StaticFiles…)` + `GET /app` → index `FileResponse`), the
  `/stream` websocket, and `/health` — all on one port. The dashboard frames `/app` and overlays
  chrome + a health badge. The ladder and its websocket wiring stay byte-for-byte intact. Strongest
  isolation, lowest risk, faithful to "vendor, don't rebuild." Rejected: Next rewrite/reverse-proxy
  (couples Next routing + needs ws proxying), and porting components into Next (duplicates logic,
  contradicts vendoring).
- **Offline behaviour = clear offline state, no persistence** (user-chosen): the ladder is
  inherently live/IBKR-dependent. Overnight from Sydney (US closed, Gateway down) the badge reports
  the disconnect and the ladder shows the vendored app's native idle state. Making the hub useful
  overnight is **SP3's** job (yfinance companion panels), not this foundation. YAGNI.
- **Provenance**: one-time copy with the source git commit hash recorded; vendored internals are
  treated as opaque (no edits). Re-vendor to update.

## Architecture

```
~/OptionsAnalysis  --one-time copy (.git stripped, commit hash recorded)-->  Market_Analyse/odte/
                                                                                   |
   launchd  com.argus.odte.plist (KeepAlive, 127.0.0.1:8788, logs/)  --supervises--+
                                                                                   |
   FastAPI on :8788  serves  /app + /assets (UI)  ·  /stream (ws)  ·  /health      |
        ^                                                                          |
        | server-side fetch (no CORS)            iframe src=http://127.0.0.1:8788/app
        |                                                       |
   app/api/odte/health/route.ts  <--SWR poll--  app/odte/page.tsx  (Next shell + health badge)
```

- **Vendored unit** `odte/` — backend + committed `frontend/dist`, source kept for reproducibility.
  Runs exactly as it does standalone. Interface: HTTP `/app`, `/health`, ws `/stream` on `:8788`.
- **Supervision** `com.argus.odte.plist` — follows the existing `com.argus.*` launchd convention
  (`KeepAlive`, bound to `127.0.0.1:8788` — dedicated port, away from the 8000 default and the
  Argus API — logging into `logs/`). Port is env-configurable.
- **Embed surface** `app/odte/page.tsx` — renders the ladder full-bleed via
  `<iframe src="http://127.0.0.1:8788/app">` inside dashboard chrome, with a live/down badge overlay.
- **Health proxy** `app/api/odte/health/route.ts` — mirrors the existing `app/api/argus/health`
  route; server-fetches `127.0.0.1:8788/health` and returns `{ up, ibkr }`. Server-side fetch
  sidesteps browser CORS; badge polls it via SWR.

## Data flow & error handling

- **Live:** dashboard `/odte` → iframe loads backend `/app` → vendored ladder opens ws `/stream`
  to its own origin (`:8788`) → IBKR ingest streams `snapshot`/`delta`/`heartbeat`. Fully
  same-origin *within the frame* — no CORS/proxy.
- **Badge:** `/odte` page → SWR `/api/odte/health` → Next route server-fetches backend `/health`.
- **Backend up, IBKR disconnected:** `/health` reports `ibkr: disconnected` → badge "IBKR
  disconnected"; ladder shows the vendored idle/empty state. No snapshot persistence.
- **Backend down (launchd restarting):** health proxy fetch fails → badge "service down" + a small
  "ladder offline" overlay in place of a broken iframe. The page handles the fetch failure cleanly.

## Known integration risk (this foundation exists to flush it out)

Cross-port framing: the Next page (`localhost:3000`) frames the backend (`127.0.0.1:8788`). FastAPI
sends no `X-Frame-Options` by default, so the iframe should render. If a proxy or middleware blocks
it, the fix is one line allowing the dashboard origin as a `frame-ancestors` source. Called out
because it's the single most likely thing to bite.

## Testing

- **Service smoke:** launchd service boots; `/health` 200, `/app` 200, `/stream` ws handshake.
- **Dashboard (vitest, existing patterns):** `/odte` renders; iframe `src` is correct; badge
  reflects the health route mocked up / down / ibkr-disconnected. A Playwright mount check (matching
  repo usage) confirms the iframe mounts.
- **Isolation:** the vendored app's own test suite stays in `odte/` and is **not** wired into the
  dashboard suite.

## Out of scope (later sub-projects / YAGNI)

Multi-underlying SPX/SPY · NDX/QQQ · RUT/IWM · DJX/DIA (SP2); WS-1 companion 2×2 grid (SP3);
snapshot persistence / overnight ladder usability; any edits to the vendored ladder's internals.

## Future direction (non-binding — informs, does not expand scope)

The end-state intent is to give **Argus** the same standalone-app treatment as OptionsAnalysis —
its own supervised service framed into the dashboard. The supervised-service + iframe-embed +
health-proxy pattern established here is therefore a **template** to reuse, not a one-off. Build the
launchd/health/embed pieces cleanly so the pattern transfers, but do **not** abstract for Argus now
(no speculative generalisation) — Argus-as-app is its own future workstream.

## Caveat

The live ladder requires IBKR Gateway; without it the hub shows the offline state until SP3's
overnight-capable companion panels land. This sub-project delivers the embed + supervision + health
surface, not an overnight-useful hub on its own.
