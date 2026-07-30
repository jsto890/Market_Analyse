"use client";

import useSWR from "swr";
import type { Bar } from "@/components/charts/CandleChart";
import { range52w, volumeVsAvg } from "@/lib/bar-stats";
import { STATE_LABEL, usMarketState } from "@/lib/market-clock";
import StatChip from "@/components/ui/StatChip";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export default function ChartInfoStrip({ ticker, bars }: { ticker: string; bars: Bar[] }) {
  const state = usMarketState();
  const extended = state === "pre" || state === "after";
  const { data: ext } = useSWR<{ price: number }>(
    extended ? `/api/argus/extended/${ticker}` : null,
    fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  );

  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  const volX = volumeVsAvg(bars);
  const r52 = range52w(bars);
  const extPct = ext && last.close > 0 ? ((ext.price - last.close) / last.close) * 100 : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 px-0.5">
      <StatChip label="Session" value={STATE_LABEL[state]} />
      <StatChip label="Close" value={last.close.toFixed(2)} />
      <StatChip label="Range" value={`${last.low.toFixed(2)}–${last.high.toFixed(2)}`} />
      {volX !== null && (
        <StatChip
          label="Vol"
          value={`${volX.toFixed(1)}× avg`}
          tone={volX >= 1.5 ? "warn" : undefined}
        />
      )}
      {r52 && (
        <StatChip
          label="52w"
          value={`${r52.lo.toFixed(0)}–${r52.hi.toFixed(0)} (${Math.round(r52.pos * 100)}%)`}
        />
      )}
      {extended && ext && extPct !== null && (
        <StatChip
          label={state === "pre" ? "Pre" : "After"}
          value={`${ext.price.toFixed(2)} (${extPct >= 0 ? "+" : ""}${extPct.toFixed(1)}%)`}
          tone={extPct >= 0 ? "pos" : "neg"}
        />
      )}
    </div>
  );
}
