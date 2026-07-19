import { usMarketState, futuresMarketState } from "./market-clock";

export type QuoteGroup = "futures" | "indices" | "forex";
export type ChangeBasis = "session" | "prev";

/** Spec §3: session open -> current-day change; overnight/closed -> past-day change. */
export function pickChangeBasis({ group, now = new Date() }: { group: QuoteGroup; now?: Date }): ChangeBasis {
  if (group === "forex") return "session";
  if (group === "futures") return futuresMarketState(now) === "open" ? "session" : "prev";
  return usMarketState(now) === "regular" ? "session" : "prev";
}

export function computePct(price: number, lastClose: number, prevClose: number, basis: ChangeBasis): number {
  const num = basis === "session" ? price : lastClose;
  const den = basis === "session" ? lastClose : prevClose;
  if (!den || !Number.isFinite(den) || !Number.isFinite(num)) return 0;
  return (num / den - 1) * 100;
}
