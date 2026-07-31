"use client";

import useSWR from "swr";
import type { Bar } from "@/components/charts/CandleChart";
import { usMarketState } from "@/lib/market-clock";
import StatChip from "@/components/ui/StatChip";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

/**
 * What the chart and the header can't say. Close, day range, volume vs average
 * and the 52-week range all moved into the header's price zone, and session
 * phase belongs to the context strip — printing them again under the chart put
 * four of the header's own numbers 400px below it (TK-05).
 */
export default function ChartInfoStrip({ ticker, bars }: { ticker: string; bars: Bar[] }) {
  const state = usMarketState();
  const extended = state === "pre" || state === "after";
  const { data: ext } = useSWR<{ price: number }>(
    extended ? `/api/argus/extended/${ticker}` : null,
    fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  );

  if (bars.length === 0 || !extended || !ext) return null;
  const last = bars[bars.length - 1];
  const extPct = last.close > 0 ? ((ext.price - last.close) / last.close) * 100 : null;
  if (extPct === null) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
      <StatChip
        label={state === "pre" ? "Pre" : "After"}
        value={`${ext.price.toFixed(2)} (${extPct >= 0 ? "+" : ""}${extPct.toFixed(1)}%)`}
        tone={extPct >= 0 ? "pos" : "neg"}
      />
    </div>
  );
}
