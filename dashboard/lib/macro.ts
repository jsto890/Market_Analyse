"use client";

import useSWR from "swr";
import { visibilityAwareInterval } from "@/lib/swr-visibility";

export interface MacroGauge {
  scope: string; window: string; score: number; n: number; ts: string;
}
export interface MacroPoint { ts: string; score: number; n: number; }

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useMacro() {
  return useSWR<{ gauges: MacroGauge[] }>("/api/argus/macro", fetcher, {
    refreshInterval: visibilityAwareInterval(60_000), shouldRetryOnError: false,
  });
}

export function useMacroSeries(scope: string, window: string, limit?: number) {
  const lim = limit ? `&limit=${limit}` : "";
  return useSWR<{ scope: string; window: string; points: MacroPoint[] }>(
    `/api/argus/macro/series?scope=${encodeURIComponent(scope)}&window=${window}${lim}`,
    fetcher, { refreshInterval: visibilityAwareInterval(60_000), shouldRetryOnError: false });
}

export interface MacroTile {
  scope: string; score: number; n: number; ts: string;
  delta_1h: number | null; delta_1d: number | null; spark: number[];
}

export function useMacroTiles(window: string) {
  return useSWR<{ window: string; tiles: MacroTile[] }>(
    `/api/argus/macro/tiles?window=${window}&points=20`,
    fetcher, { refreshInterval: visibilityAwareInterval(60_000), shouldRetryOnError: false });
}

export interface MacroContributor {
  headline: string; ticker: string | null; source: string | null; url: string | null;
  ts: string; score: number; weight: number; share: number;
}
export interface MacroContributors {
  scope: string; window: string; n: number; score: number;
  items: MacroContributor[]; tickers: { ticker: string; n: number }[];
}

/** The headlines behind one gauge. Pass enabled=false to skip the request. */
export function useMacroContributors(scope: string, window: string, enabled = true) {
  return useSWR<MacroContributors>(
    enabled
      ? `/api/argus/macro/contributors?scope=${encodeURIComponent(scope)}&window=${window}&limit=25`
      : null,
    fetcher, { refreshInterval: visibilityAwareInterval(60_000), shouldRetryOnError: false });
}

/**
 * What each lookback actually means, and the benchmark bars that match it — the
 * SPY overlay used to be a fixed month of daily bars against an hour of
 * sentiment (MAC-08).
 */
export const WINDOW_META: Record<string, {
  label: string; lookback: string; meaning: string; halfLife: string;
  seriesLimit: number; benchmark: { period: string; interval: string };
}> = {
  "1h": {
    label: "1 hour", lookback: "past 60 minutes", halfLife: "30 minutes",
    meaning: "Each point is the gauge as it stood at that moment, computed from the headlines of the previous 60 minutes.",
    seriesLimit: 72, benchmark: { period: "5d", interval: "15m" },
  },
  "1d": {
    label: "1 day", lookback: "past 24 hours", halfLife: "12 hours",
    meaning: "Each point is the gauge as it stood at that moment, computed from the headlines of the previous 24 hours.",
    seriesLimit: 216, benchmark: { period: "5d", interval: "30m" },
  },
  "1w": {
    label: "1 week", lookback: "past 7 days", halfLife: "3.5 days",
    meaning: "Each point is the gauge as it stood at that moment, computed from the headlines of the previous 7 days.",
    seriesLimit: 1000, benchmark: { period: "1mo", interval: "1d" },
  },
};

/** Scores inside ±this read as neutral everywhere in the UI. */
export const NEUTRAL_BAND = 0.05;

/** Human label for a scope key. "sector:AI / Compute" → "AI / Compute". */
export function scopeLabel(scope: string): string {
  return scope.startsWith("sector:") ? scope.slice(7) : scope.toUpperCase();
}

/** −1..1 → tone class. Green above the neutral band, red below, muted inside. */
export function toneClass(score: number): string {
  if (score > NEUTRAL_BAND) return "text-pos";
  if (score < -NEUTRAL_BAND) return "text-neg";
  return "text-muted";
}

/** The word behind the colour — the band was previously invisible (MAC-06). */
export function toneLabel(score: number): string {
  if (score > NEUTRAL_BAND) return "bullish";
  if (score < -NEUTRAL_BAND) return "bearish";
  return "neutral";
}

export function signed(value: number, dp = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(dp)}`;
}
