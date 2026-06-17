"use client";

import useSWR from "swr";

export interface MacroGauge {
  scope: string; window: string; score: number; n: number; ts: string;
}
export interface MacroPoint { ts: string; score: number; n: number; }

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useMacro() {
  return useSWR<{ gauges: MacroGauge[] }>("/api/argus/macro", fetcher, {
    refreshInterval: 60_000, shouldRetryOnError: false,
  });
}

export function useMacroSeries(scope: string, window: string) {
  return useSWR<{ scope: string; window: string; points: MacroPoint[] }>(
    `/api/argus/macro/series?scope=${encodeURIComponent(scope)}&window=${window}`,
    fetcher, { refreshInterval: 60_000, shouldRetryOnError: false });
}

/** Human label for a scope key. "sector:AI / Compute" → "AI / Compute". */
export function scopeLabel(scope: string): string {
  return scope.startsWith("sector:") ? scope.slice(7) : scope.toUpperCase();
}

/** −1..1 → tone class. Green above +0.05, red below −0.05, muted between. */
export function toneClass(score: number): string {
  if (score > 0.05) return "text-accent";
  if (score < -0.05) return "text-warn";
  return "text-muted";
}
