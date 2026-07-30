// dashboard/lib/storageKeys.ts

/**
 * Every localStorage key this app writes. Keep this list exhaustive — it is
 * the source G-14's "reset all stored preferences" action reads to know what
 * to clear. Do not construct a `dash:*` key anywhere except via the helpers
 * below (or, for truly dynamic per-instance keys like `dash:collapsible:{key}`,
 * by matching the *prefix* patterns listed in `DYNAMIC_KEY_PREFIXES`).
 */
export const STATIC_KEYS = {
  todayFilters: "dash:today:filters",
  commandkRecent: "dash:commandk:recent",
  riskAccountSize: "dash:risk:accountSize",
  riskPct: "dash:risk:pct",
  watchlistMigrationResult: "dash:watchlist:migration-result",
  screenerLastResult: "dash:screener:last-result",
  odteLiveMode: "dash:odte:live-mode",
  odteExpiry: "dash:odte:expiry",
} as const;

/**
 * Prefixes for dynamically-suffixed keys (one per persisted component
 * instance). `resetAllStoredPrefs()` clears every localStorage key starting
 * with any of these, plus every key in STATIC_KEYS.
 */
export const DYNAMIC_KEY_PREFIXES = [
  "dash:collapsible:", // Collapsible primitive (replaces dash:panel: below)
  "dash:table:",       // DataTable sort state — "dash:table:{persistKey}:sort"
  "dash:chart:",       // per-ticker chart settings — "dash:chart:{ticker}"
] as const;

/** Retired prefix, still read (one-time migration) but never written after the Collapsible rollout — see contract §F. */
export const LEGACY_KEY_PREFIXES = [
  "dash:panel:",      // Panel.tsx / DiffStrip.tsx pre-Collapsible key — migrate value into dash:collapsible: on first read, then stop writing this prefix.
  "argus_watchlist",  // pre-API-backed watchlist (WL-07) — one-time read-and-clear on the watchlist page, per existing migration code in WatchlistClient.tsx.
] as const;

export function resetAllStoredPrefs(): void {
  const prefixes: readonly string[] = [...DYNAMIC_KEY_PREFIXES, ...LEGACY_KEY_PREFIXES];
  const staticKeys: string[] = Object.values(STATIC_KEYS);
  for (const key of Object.keys(localStorage)) {
    if (staticKeys.includes(key) || prefixes.some((p) => key.startsWith(p))) {
      localStorage.removeItem(key);
    }
  }
}
