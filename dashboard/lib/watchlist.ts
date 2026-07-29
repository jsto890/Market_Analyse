"use client";

import useSWR from "swr";

export interface WatchlistEntry {
  ticker: string; pinned_at: string; price_at_pin: number | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

/** Set of tickers currently pinned to watchlist, for client-side feed filtering. */
export function useWatchlistTickers(): Set<string> {
  const { data } = useSWR<{ watchlist: WatchlistEntry[] }>("/api/watchlist", fetcher, {
    refreshInterval: 60_000, shouldRetryOnError: false,
  });
  return new Set((data?.watchlist ?? []).map((w) => w.ticker));
}
