"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { companionSymbol } from "@/lib/odteCompanion";
import type { LadderPayload, OdteSymbol } from "./odte-core";
import { isOdteSymbol } from "./odte-core";

export * from "./odte-core";

/** Underlying selection persisted across the /options tabs; backend sync is best-effort. */
export function useOdteSymbol(): [OdteSymbol, (symbol: OdteSymbol) => void] {
  const [stored, setStored] = useLocalStorage<string>("odte-symbol", "SPY");
  const active: OdteSymbol = isOdteSymbol(stored) ? stored : "SPY";

  const switchSymbol = useCallback(
    (symbol: OdteSymbol) => {
      if (symbol === active) return;
      setStored(symbol);
      fetch("/api/odte/symbol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      }).catch(() => {});
    },
    [active, setStored]
  );

  return [active, switchSymbol];
}

const ladderFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

/** Per-underlying multi-expiry strike ladder, band-limited around spot. */
export function useLadder(symbol: OdteSymbol, expiries = 4, band = 0.06) {
  const target = companionSymbol(symbol);
  return useSWR<LadderPayload>(
    `/api/argus/ladder/${target}?expiries=${expiries}&band=${band}`,
    ladderFetcher,
    { refreshInterval: 60_000 }
  );
}
