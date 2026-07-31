"use client";

import { createContext, useContext, useMemo } from "react";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import { DEFAULT_DENSITY, normalizeDensity, type DensityKey } from "@/lib/optionsAnalytics";

/** One 641-line page became five focused ones; these are its tabs (OPT-07).
 * Lives here rather than in the layout because Next forbids extra exports from
 * a route file. */
export const OPTIONS_TABS = [
  { href: "/options", label: "Overview", blurb: "Is today tradeable, and which way" },
  { href: "/options/ladder", label: "Ladder", blurb: "Strike-by-strike quotes and greeks" },
  { href: "/options/gamma", label: "Gamma", blurb: "Dealer positioning across strikes" },
  { href: "/options/flow", label: "Flow", blurb: "Where today's volume is going" },
  { href: "/options/greeks", label: "Greeks", blurb: "Aggregate dealer exposure, strike by strike" },
  { href: "/learn/options", label: "Learn", blurb: "How to read all of the above" },
] as const;

export interface OptionsUiState {
  /** Live ladder on/off — one control in the /options header, read by every tab. */
  live: boolean;
  setLive: (v: boolean) => void;
  density: DensityKey;
  setDensity: (v: DensityKey) => void;
  expiry: string;
  setExpiry: (v: string) => void;
}

const Ctx = createContext<OptionsUiState | null>(null);

function useLocalState(): OptionsUiState {
  const [live, setLive] = useLocalStorage(STATIC_KEYS.odteLiveMode, false);
  const [stored, setDensity] = useLocalStorage<DensityKey>(STATIC_KEYS.odteDensity, DEFAULT_DENSITY);
  const [expiry, setExpiry] = useLocalStorage(STATIC_KEYS.odteExpiry, "0DTE");
  // Normalise on read, not on write: the key predates strike counts, so a
  // browser holding `normal` would otherwise leave every segment unselected.
  const density = normalizeDensity(stored);
  return useMemo(
    () => ({ live, setLive, density, setDensity, expiry, setExpiry }),
    [live, setLive, density, setDensity, expiry, setExpiry]
  );
}

export function OptionsUiProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={useLocalState()}>{children}</Ctx.Provider>;
}

/** Shared under the /options layout; falls back to page-local state elsewhere
 * (and in tests that render a tab on its own). */
export function useOptionsUi(): OptionsUiState {
  const fallback = useLocalState();
  return useContext(Ctx) ?? fallback;
}
