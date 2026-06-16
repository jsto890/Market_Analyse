"use client";

import useSWR from "swr";

export interface NewsItem {
  id: number; ts: string; source: string; ticker: string | null;
  headline: string; body: string | null; url: string | null; is_breaking: number;
}
const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useNewsFeed() {
  return useSWR<{ items: NewsItem[]; cursor: number }>(
    "/api/argus/news?latest=60", fetcher,
    { refreshInterval: 25_000, shouldRetryOnError: false }
  );
}

export function relTime(ts: string): string {
  const ms = Date.now() - new Date(ts.replace(" ", "T")).getTime();
  if (!Number.isFinite(ms)) return "";
  const m = ms / 60000;
  if (m < 1) return "now"; if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60; if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
