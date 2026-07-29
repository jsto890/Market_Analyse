"use client";

import { useMemo } from "react";
import CandleChart, { type Bar, type Marker } from "@/components/charts/CandleChart";
import { useTickerData } from "@/lib/useTickerData";
import { deriveLevels, levelsToChartLevels } from "@/lib/levels";
import type { BridgeRow } from "@/types/bridge";

interface TickerChartSectionProps {
  ticker: string;
  bridgeRow: BridgeRow | null;
  initialBars: Bar[];
  markers: Marker[];
  height?: number;
  className?: string;
}

export default function TickerChartSection({
  ticker,
  bridgeRow,
  initialBars,
  markers,
  height = 420,
  className,
}: TickerChartSectionProps) {
  const { actionCard } = useTickerData(ticker);

  const levels = useMemo(
    () => (bridgeRow ? levelsToChartLevels(deriveLevels(bridgeRow, actionCard.data)) : []),
    [bridgeRow, actionCard.data]
  );

  return (
    <CandleChart
      ticker={ticker}
      initialBars={initialBars}
      initialPeriod="6M"
      levels={levels}
      markers={markers}
      height={height}
      className={className}
    />
  );
}
