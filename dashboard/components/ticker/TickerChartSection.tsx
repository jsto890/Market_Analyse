"use client";

import { useState, useMemo, useCallback, type ReactNode } from "react";
import CandleChart, { type Bar, type Marker } from "@/components/charts/CandleChart";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";
import Panel from "@/components/ui/Panel";
import SegmentedControl, { type SegmentedOption } from "@/components/ui/SegmentedControl";
import { useTickerData } from "@/lib/useTickerData";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { deriveLevels, levelsToChartLevels, type DerivedLevels } from "@/lib/levels";
import { type ChartPeriod as Period } from "@/lib/chart-range";
import type { BridgeRow } from "@/types/bridge";

type HistoryStatus = "ok" | "timeout" | "no-data" | "error";

/** The one segmented control on this panel. It lives here rather than in
 *  `CandleChart` because the mock puts it in the panel header, and the header
 *  is `Panel`'s `actions` slot (K-11). */
const RANGE_OPTIONS: readonly SegmentedOption<Period>[] = [
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1Y", label: "1Y" },
  { key: "2Y", label: "2Y" },
];

/** Read out in the order the sentence names them. */
const LEVEL_KEYS = ["entry", "stop", "target"] as const;

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The foot line, derived from what is actually drawn. No bridge row means no
 * levels, which means no sentence — a generic caption under an empty chart
 * would be describing something that isn't there.
 */
function chartReadThis(levels: DerivedLevels | null, lastClose: number | null): string | undefined {
  if (!levels) return undefined;
  const drawn = LEVEL_KEYS.filter((key) => {
    const v = levels[key];
    return v != null && Number.isFinite(v);
  });
  if (drawn.length === 0) return undefined;

  const names = joinWords([...drawn]);
  const verb = drawn.length === 1 ? "is" : "are";
  const opening = `${names[0].toUpperCase()}${names.slice(1)} ${verb} drawn on the price rather than listed beside it.`;

  const where =
    lastClose == null
      ? ""
      : ` The last close sits ${joinWords(
          drawn.map((key) => `${lastClose >= (levels[key] as number) ? "above" : "below"} ${key}`)
        )}.`;

  return `${opening}${where} They mark where the thesis was formed, not where an order sits.`;
}

interface TickerChartSectionProps {
  ticker: string;
  bridgeRow: BridgeRow | null;
  initialBars: Bar[];
  initialStatus: HistoryStatus;
  markers: Marker[];
  height?: number;
  className?: string;
  /** The info strip, rendered under the chart inside the same panel. Passed in
   *  rather than imported so the page can keep handing over a server-rendered
   *  element. */
  children?: ReactNode;
}

export default function TickerChartSection({
  ticker,
  bridgeRow,
  initialBars,
  initialStatus,
  markers,
  height = 420,
  className,
  children,
}: TickerChartSectionProps) {
  const [bars, setBars] = useState(initialBars);
  const [status, setStatus] = useState<HistoryStatus>(initialStatus);
  const [retrying, setRetrying] = useState(false);
  const [period, setPeriod] = useLocalStorage<Period>(`dash:chart:${ticker}:period`, "6M");
  const { actionCard } = useTickerData(ticker);

  const derived = useMemo(
    () => (bridgeRow ? deriveLevels(bridgeRow, actionCard.data) : null),
    [bridgeRow, actionCard.data]
  );
  const levels = useMemo(() => (derived ? levelsToChartLevels(derived) : []), [derived]);
  const lastClose = bars.length > 0 ? bars[bars.length - 1].close : null;

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

  let body: ReactNode;
  if (status === "no-data") {
    body = (
      <div className={className}>
        <Empty
          title="No price history"
          message={`The bar feed returned nothing for ${ticker}.`}
          fill
        />
      </div>
    );
  } else if (status !== "ok") {
    body = (
      <div className={className}>
        <Failed
          title="Chart unavailable"
          message={
            status === "timeout"
              ? `The history request for ${ticker} timed out. The chart is the only thing missing — everything else on this page is current.`
              : `History for ${ticker} didn’t load. The chart is the only thing missing — everything else on this page is current.`
          }
          action={
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="rounded border border-accent/40 px-2 py-0.5 text-data text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          }
          fill
        />
      </div>
    );
  } else {
    body = (
      <CandleChart
        ticker={ticker}
        initialBars={bars}
        period={period}
        levels={levels}
        markers={markers}
        height={height}
        className={className}
      />
    );
  }

  const drawing = status === "ok";

  return (
    <Panel
      title="Chart"
      actions={
        drawing ? (
          <SegmentedControl<Period>
            label="Chart range"
            labelHidden
            value={period}
            options={RANGE_OPTIONS}
            onChange={setPeriod}
          />
        ) : undefined
      }
      readThis={drawing ? chartReadThis(derived, lastClose) : undefined}
    >
      {body}
      {children}
    </Panel>
  );
}
