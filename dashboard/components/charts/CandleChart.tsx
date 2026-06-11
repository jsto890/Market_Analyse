"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import EmptyState from "@/components/ui/EmptyState";

export interface Level {
  price: number;
  kind: "entry" | "stop" | "target";
}
export interface Marker {
  date: string;
  label: string;
}
export interface Bar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Period = "3M" | "6M" | "1Y" | "2Y";
const PERIOD_PARAM: Record<Period, string> = {
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
  "2Y": "2y",
};

interface EmaToggles {
  e20: boolean;
  e50: boolean;
  e200: boolean;
}
interface PersistedState {
  period: Period;
  emas: EmaToggles;
  log: boolean;
}
const DEFAULT_PERSIST: PersistedState = {
  period: "6M",
  emas: { e20: true, e50: true, e200: false },
  log: false,
};

function computeEma(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = new Array(period - 1).fill(NaN);
  result.push(seed);
  for (let i = period; i < closes.length; i++) {
    result.push(closes[i] * k + result[result.length - 1] * (1 - k));
  }
  return result;
}

function toUTC(ts: string): UTCTimestamp {
  return (Date.parse(ts) / 1000) as UTCTimestamp;
}

interface Props {
  ticker: string;
  initialBars: Bar[];
  initialPeriod?: Period;
  levels?: Level[];
  markers?: Marker[];
  height?: number;
  className?: string;
}

const LEVEL_STYLE = {
  entry: { color: "#e6e8ec", lineStyle: 2, title: "E" },
  stop: { color: "#f85149", lineStyle: 0, title: "S" },
  target: { color: "#3fb950", lineStyle: 0, title: "T" },
} as const;

const EMA_STYLE = {
  e20: { color: "#4c8dff", title: "EMA 20" },
  e50: { color: "#d29922", title: "EMA 50" },
  e200: { color: "#8b93a3", title: "EMA 200" },
};
const EMA_PERIOD = { e20: 20, e50: 50, e200: 200 } as const;

export default function CandleChart({
  ticker,
  initialBars,
  initialPeriod,
  levels = [],
  markers = [],
  height = 420,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaSeriesRef = useRef<{
    e20: ISeriesApi<"Line"> | null;
    e50: ISeriesApi<"Line"> | null;
    e200: ISeriesApi<"Line"> | null;
  }>({ e20: null, e50: null, e200: null });

  const barsRef = useRef<Bar[]>(initialBars);

  const [activePeriod, setActivePeriod] = useState<Period>(
    initialPeriod ?? DEFAULT_PERSIST.period
  );
  const [emas, setEmas] = useState<EmaToggles>(DEFAULT_PERSIST.emas);
  const [logScale, setLogScale] = useState(DEFAULT_PERSIST.log);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const chartReady = useRef(false);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dash:chart:${ticker}`);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedState>;
        if (saved.period) setActivePeriod(saved.period);
        if (saved.emas) setEmas(saved.emas);
        if (typeof saved.log === "boolean") setLogScale(saved.log);
      }
    } catch {
      // ignore parse errors
    }
  }, [ticker]);

  // Persist state changes
  useEffect(() => {
    try {
      localStorage.setItem(
        `dash:chart:${ticker}`,
        JSON.stringify({ period: activePeriod, emas, log: logScale })
      );
    } catch {
      // ignore quota errors
    }
  }, [ticker, activePeriod, emas, logScale]);

  // Push bar data + EMA + volume into existing series
  const applyData = useCallback((bars: Bar[]) => {
    if (!seriesRef.current || !volSeriesRef.current) return;

    const candleData = bars.map((b) => ({
      time: toUTC(b.ts),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    seriesRef.current.setData(candleData);

    seriesRef.current.setMarkers(
      markers.map((m) => ({
        time: toUTC(m.date),
        position: "belowBar" as const,
        shape: "arrowUp" as const,
        color: "#4c8dff",
        text: m.label,
      }))
    );

    const volData = bars.map((b) => ({
      time: toUTC(b.ts),
      value: b.volume,
      color:
        b.close >= b.open
          ? "rgba(63,185,80,0.4)"
          : "rgba(248,81,73,0.4)",
    }));
    volSeriesRef.current.setData(volData);

    const closes = bars.map((b) => b.close);
    const times = bars.map((b) => toUTC(b.ts));

    for (const key of ["e20", "e50", "e200"] as const) {
      const emaSeries = emaSeriesRef.current[key];
      if (!emaSeries) continue;
      const vals = computeEma(closes, EMA_PERIOD[key]);
      const emaData = vals
        .map((v, i) => ({ time: times[i], value: v }))
        .filter((d) => !isNaN(d.value));
      emaSeries.setData(emaData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [markers]);

  // Apply log scale toggle to existing chart
  useEffect(() => {
    if (!chartRef.current || !chartReady.current) return;
    chartRef.current.priceScale("right").applyOptions({ mode: logScale ? 1 : 0 });
  }, [logScale]);

  // Toggle EMA series visibility
  useEffect(() => {
    if (!chartReady.current) return;
    for (const key of ["e20", "e50", "e200"] as const) {
      emaSeriesRef.current[key]?.applyOptions({ visible: emas[key] });
    }
  }, [emas]);

  // Chart mount (once)
  useEffect(() => {
    let destroyed = false;

    import("lightweight-charts").then(
      ({ createChart, ColorType, LineStyle }) => {
        if (destroyed || !containerRef.current) return;

        const chart = createChart(containerRef.current, {
          height,
          layout: {
            background: { type: ColorType.Solid, color: "#0b0e14" },
            textColor: "#8b93a3",
          },
          grid: {
            vertLines: { color: "#161b24" },
            horzLines: { color: "#161b24" },
          },
          rightPriceScale: {
            borderColor: "#222936",
            scaleMargins: { top: 0.1, bottom: 0.3 },
          },
          timeScale: { borderColor: "#222936" },
        });

        const candleSeries = chart.addCandlestickSeries({
          upColor: "#3fb950",
          downColor: "#f85149",
          wickUpColor: "#3fb950",
          wickDownColor: "#f85149",
          borderVisible: false,
        });

        for (const l of levels) {
          candleSeries.createPriceLine({
            price: l.price,
            lineWidth: 1,
            axisLabelVisible: true,
            ...LEVEL_STYLE[l.kind],
            lineStyle: LEVEL_STYLE[l.kind].lineStyle as 0 | 1 | 2 | 3 | 4,
          });
        }

        const volSeries = chart.addHistogramSeries({
          priceScaleId: "vol",
          priceFormat: { type: "volume" },
        });
        chart.priceScale("vol").applyOptions({
          scaleMargins: { top: 0.75, bottom: 0 },
        });

        const emaSeries = {
          e20: chart.addLineSeries({
            color: EMA_STYLE.e20.color,
            lineWidth: 1,
            title: EMA_STYLE.e20.title,
            visible: DEFAULT_PERSIST.emas.e20,
            priceLineVisible: false,
            lastValueVisible: false,
          }),
          e50: chart.addLineSeries({
            color: EMA_STYLE.e50.color,
            lineWidth: 1,
            title: EMA_STYLE.e50.title,
            visible: DEFAULT_PERSIST.emas.e50,
            priceLineVisible: false,
            lastValueVisible: false,
          }),
          e200: chart.addLineSeries({
            color: EMA_STYLE.e200.color,
            lineWidth: 1,
            title: EMA_STYLE.e200.title,
            visible: DEFAULT_PERSIST.emas.e200,
            priceLineVisible: false,
            lastValueVisible: false,
          }),
        };

        chartRef.current = chart;
        seriesRef.current = candleSeries;
        volSeriesRef.current = volSeries;
        emaSeriesRef.current = emaSeries;
        chartReady.current = true;

        // Apply current state from already-resolved state
        chart.priceScale("right").applyOptions({ mode: logScale ? 1 : 0 });
        for (const key of ["e20", "e50", "e200"] as const) {
          emaSeries[key].applyOptions({ visible: emas[key] });
        }

        // Push data — covers the "chart created after data arrived" path
        applyData(barsRef.current);
      }
    );

    return () => {
      destroyed = true;
      chartReady.current = false;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volSeriesRef.current = null;
      emaSeriesRef.current = { e20: null, e50: null, e200: null };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // Data update effect — covers "data arrived after chart was ready"
  useEffect(() => {
    barsRef.current = initialBars;
    if (chartReady.current) {
      applyData(initialBars);
    }
    // chart not ready yet → applyData will be called inside the .then above
  }, [initialBars, applyData]);

  const fetchPeriod = useCallback(
    async (p: Period) => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(
          `/api/argus/history/${encodeURIComponent(ticker)}?period=${PERIOD_PARAM[p]}`
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as { bars: Bar[] };
        barsRef.current = json.bars;
        applyData(json.bars);
        setActivePeriod(p);
      } catch {
        setFetchError(`failed to load ${p}`);
      } finally {
        setLoading(false);
      }
    },
    [ticker, applyData]
  );

  if (initialBars.length === 0 && !loading) {
    return <EmptyState message="no chart data" />;
  }

  return (
    <div className={className}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-2 px-0.5">
        {/* Range pills */}
        <div className="flex gap-1">
          {(["3M", "6M", "1Y", "2Y"] as Period[]).map((p) => (
            <button
              key={p}
              disabled={loading}
              onClick={() => fetchPeriod(p)}
              className={[
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                activePeriod === p
                  ? "bg-accent text-white"
                  : "bg-elevated text-muted hover:text-foreground",
                loading ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>

        <span className="text-line text-[11px]">|</span>

        {/* EMA chips */}
        {(["e20", "e50", "e200"] as const).map((key) => (
          <button
            key={key}
            onClick={() =>
              setEmas((prev) => ({ ...prev, [key]: !prev[key] }))
            }
            className={[
              "px-2 py-0.5 rounded text-[11px] font-medium transition-colors border",
              emas[key]
                ? "border-transparent text-white"
                : "bg-elevated text-muted border-line hover:text-foreground",
            ].join(" ")}
            style={emas[key] ? { backgroundColor: EMA_STYLE[key].color } : {}}
          >
            {key === "e20" ? "20" : key === "e50" ? "50" : "200"}
          </button>
        ))}

        <span className="text-line text-[11px]">|</span>

        {/* Log toggle */}
        <button
          onClick={() => setLogScale((v) => !v)}
          className={[
            "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
            logScale
              ? "bg-accent text-white"
              : "bg-elevated text-muted hover:text-foreground",
          ].join(" ")}
        >
          log
        </button>

        {fetchError && (
          <span className="text-[11px] text-muted ml-auto">{fetchError}</span>
        )}
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
