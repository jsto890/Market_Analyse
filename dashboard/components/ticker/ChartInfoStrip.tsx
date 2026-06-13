"use client";

import useSWR from "swr";
import type { Bar } from "@/components/charts/CandleChart";
import { range52w, volumeVsAvg } from "@/lib/bar-stats";
import { STATE_LABEL, usMarketState } from "@/lib/market-clock";

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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] tabular-nums text-muted mt-2 px-0.5">
      <span className="inline-flex items-center rounded border border-line bg-elevated px-1.5 py-px text-[10px]">
        {STATE_LABEL[state]}
      </span>
      <span>
        close <span className="text-foreground">{last.close.toFixed(2)}</span>
      </span>
      <span>
        range {last.low.toFixed(2)}–{last.high.toFixed(2)}
      </span>
      {volX !== null && (
        <span>
          vol <span className={volX >= 1.5 ? "text-warn" : "text-foreground"}>{volX.toFixed(1)}×</span> avg
        </span>
      )}
      {r52 && (
        <span>
          52w {r52.lo.toFixed(0)}–{r52.hi.toFixed(0)} ({Math.round(r52.pos * 100)}%)
        </span>
      )}
      {extended && ext && extPct !== null && (
        <span>
          {state === "pre" ? "pre" : "after"}{" "}
          <span className={extPct >= 0 ? "text-pos" : "text-neg"}>
            {ext.price.toFixed(2)} ({extPct >= 0 ? "+" : ""}
            {extPct.toFixed(1)}%)
          </span>
        </span>
      )}
    </div>
  );
}
