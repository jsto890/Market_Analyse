"use client";

import { useState, useMemo, useCallback } from "react";
import CandleChart, { type Bar, type Marker } from "@/components/charts/CandleChart";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import { useTickerData } from "@/lib/useTickerData";
import { deriveLevels, levelsToChartLevels } from "@/lib/levels";
import type { BridgeRow } from "@/types/bridge";

type HistoryStatus = "ok" | "timeout" | "no-data" | "error";

interface TickerChartSectionProps {
  ticker: string;
  bridgeRow: BridgeRow | null;
  initialBars: Bar[];
  initialStatus: HistoryStatus;
  markers: Marker[];
  height?: number;
  className?: string;
}

export default function TickerChartSection({
  ticker,
  bridgeRow,
  initialBars,
  initialStatus,
  markers,
  height = 420,
  className,
}: TickerChartSectionProps) {
  const [bars, setBars] = useState(initialBars);
  const [status, setStatus] = useState<HistoryStatus>(initialStatus);
  const [retrying, setRetrying] = useState(false);
  const { actionCard } = useTickerData(ticker);

  const levels = useMemo(
    () => (bridgeRow ? levelsToChartLevels(deriveLevels(bridgeRow, actionCard.data)) : []),
    [bridgeRow, actionCard.data]
  );

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/argus/history/${ticker}?period=2y`, { cache: "no-store" });
      if (res.status === 504) {
        setStatus("timeout");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const json = (await res.json()) as { bars: Bar[] };
      const nextBars = json.bars ?? [];
      if (nextBars.length === 0) {
        setStatus("no-data");
        return;
      }
      setBars(nextBars);
      setStatus("ok");
    } catch {
      setStatus("error");
    } finally {
      setRetrying(false);
    }
  }, [ticker]);

  if (status !== "ok") {
    if (status === "no-data") {
      return (
        <div className={className}>
          <Empty
            title="No price history"
            message={`The bar feed returned nothing for ${ticker}.`}
            fill
          />
        </div>
      );
    }
    const retryButton = (
      <button
        type="button"
        onClick={() => void retry()}
        disabled={retrying}
        className="rounded border border-accent/40 px-2 py-0.5 text-data text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    );
    return (
      <div className={className}>
        <Failed
          title="Chart unavailable"
          message={
            status === "timeout"
              ? `The history request for ${ticker} timed out. The chart is the only thing missing — everything else on this page is current.`
              : `History for ${ticker} didn’t load. The chart is the only thing missing — everything else on this page is current.`
          }
          action={retryButton}
          fill
        />
      </div>
    );
  }

  return (
    <CandleChart
      ticker={ticker}
      initialBars={bars}
      initialPeriod="6M"
      levels={levels}
      markers={markers}
      height={height}
      className={className}
    />
  );
}
