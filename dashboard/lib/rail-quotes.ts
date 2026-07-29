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
