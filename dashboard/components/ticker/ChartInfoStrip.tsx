"use client";

import useSWR from "swr";
import type { Bar } from "@/components/charts/CandleChart";
import { usMarketState } from "@/lib/market-clock";
import StatChip from "@/components/ui/StatChip";
import { range52w } from "@/lib/bar-stats";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

/**
 * What the chart and the header can't say. Close, day range and volume vs
 * average live in the header's price zone and session phase belongs to the
 * context strip — printing those again under the chart put the header's own
 * numbers 400px below it (TK-05). The 52-week range came back the other way:
 * the rebuilt header dropped it, and it is a fact about the series the chart
 * draws rather than about today (K-12).
 */
export default function ChartInfoStrip({ ticker, bars }: { ticker: string; bars: Bar[] }) {
  const state = usMarketState();
  const extended = state === "pre" || state === "after";
  const { data: ext } = useSWR<{ price: number }>(
    extended ? `/api/argus/extended/${ticker}` : null,
    fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  );

  const last = bars.length > 0 ? bars[bars.length - 1] : null;
  const extPct =
    ext && last && last.close > 0 ? ((ext.price - last.close) / last.close) * 100 : null;
  const range = range52w(bars);

  if (extPct === null && range === null) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
      {ext && extPct !== null && (
        <StatChip
          label={state === "pre" ? "Pre" : "After"}
          value={`${ext.price.toFixed(2)} (${extPct >= 0 ? "+" : ""}${extPct.toFixed(1)}%)`}
          tone={extPct >= 0 ? "pos" : "neg"}
        />
      )}
      {range && (
        <StatChip label="52w" value={`${range.lo.toFixed(2)}–${range.hi.toFixed(2)}`} />
      )}
    </div>
  );
}
