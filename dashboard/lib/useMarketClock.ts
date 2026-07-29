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
