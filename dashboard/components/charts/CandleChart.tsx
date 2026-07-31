"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from "lightweight-charts";
import Empty from "@/components/ui/Empty";
import Toggle from "@/components/ui/Toggle";
import { visibleRangeFor, type ChartPeriod as Period } from "@/lib/chart-range";

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
  const d = ts.slice(0, 10);
  const [y, m, day] = d.split("-").map(Number);
  return (Date.UTC(y, m - 1, day) / 1000) as UTCTimestamp;
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
  stop: { color: "var(--red)", lineStyle: 0, title: "S" },
  target: { color: "var(--green)", lineStyle: 0, title: "T" },
} as const;

const EMA_STYLE = {
  e20: { color: "var(--accent)", title: "EMA 20" },
  e50: { color: "var(--amber)", title: "EMA 50" },
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
  const aliveRef = useRef(true);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const levelsRef = useRef<Level[]>(levels);
  const resolvedColorsRef = useRef<{ red: string; green: string }>({ red: "#f85149", green: "#3fb950" });

  const [activePeriod, setActivePeriod] = useState<Period>(
    initialPeriod ?? DEFAULT_PERSIST.period
  );
  const [emas, setEmas] = useState<EmaToggles>(DEFAULT_PERSIST.emas);
  const [logScale, setLogScale] = useState(DEFAULT_PERSIST.log);
  const [ohlc, setOhlc] = useState<
    { date: string; open: number; high: number; low: number; close: number; volume: number } | null
  >(null);
  const periodRef = useRef<Period>(initialPeriod ?? DEFAULT_PERSIST.period);
  const chartReady = useRef(false);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dash:chart:${ticker}`);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedState>;
        if (saved.period) {
          setActivePeriod(saved.period);
          // periodRef.current set here is consumed by applyData when the chart (re)applies data
          periodRef.current = saved.period;
        }
        if (saved.emas) setEmas(saved.emas);
        if (typeof saved.log === "boolean") setLogScale(saved.log);
      }
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        ...(m.label ? { text: m.label } : {}),
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

    if (chartRef.current && bars.length >= 2) {
      const { from, to } = visibleRangeFor(
        periodRef.current,
        toUTC(bars[0].ts) as number,
        toUTC(bars[bars.length - 1].ts) as number
      );
      chartRef.current.timeScale().setVisibleRange({
        from: from as UTCTimestamp,
        to: to as UTCTimestamp,
      });
    }
  }, [markers]);

  const syncPriceLines = useCallback((series: ISeriesApi<"Candlestick">, lvls: Level[]) => {
    for (const pl of priceLinesRef.current) {
      series.removePriceLine(pl);
    }
    const { red, green } = resolvedColorsRef.current;
    priceLinesRef.current = lvls.map((l) => {
      const levelColor = l.kind === "stop" ? red : l.kind === "target" ? green : LEVEL_STYLE[l.kind].color;
      return series.createPriceLine({
        price: l.price,
        lineWidth: 1,
        axisLabelVisible: true,
        ...LEVEL_STYLE[l.kind],
        color: levelColor,
        lineStyle: LEVEL_STYLE[l.kind].lineStyle as 0 | 1 | 2 | 3 | 4,
      });
    });
  }, []);

  const applyPeriod = useCallback((p: Period) => {
    periodRef.current = p;
    setActivePeriod(p);
    const bars = barsRef.current;
    if (!chartRef.current || bars.length < 2) return;
    const { from, to } = visibleRangeFor(
      p,
      toUTC(bars[0].ts) as number,
      toUTC(bars[bars.length - 1].ts) as number
    );
    chartRef.current.timeScale().setVisibleRange({
      from: from as UTCTimestamp,
      to: to as UTCTimestamp,
    });
  }, []);

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

        // lightweight-charts hands series/price-line colors straight to the Canvas 2D
        // context (and, for price-line/last-value axis labels, through its own color
        // parser which throws on unrecognized strings) — raw `var(--x)` strings are not
        // resolved in either path, so resolve the CSS custom properties once here.
        const rootStyle = getComputedStyle(document.documentElement);
        const resolvedRed = rootStyle.getPropertyValue("--red").trim() || "#f85149";
        const resolvedGreen = rootStyle.getPropertyValue("--green").trim() || "#3fb950";
        const resolvedAccent = rootStyle.getPropertyValue("--accent").trim() || "#4c8dff";
        const resolvedAmber = rootStyle.getPropertyValue("--amber").trim() || "#d29922";
        resolvedColorsRef.current = { red: resolvedRed, green: resolvedGreen };

        const chart = createChart(containerRef.current, {
          autoSize: true,
          height,
          layout: {
            background: { type: ColorType.Solid, color: "#0b0e14" },
            textColor: "#8b93a3",
            attributionLogo: false,
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

        // initial draw only — the levels-update effect below keeps these in sync
        // with the `levels` prop as live action_card data arrives (TK-02)
        syncPriceLines(candleSeries, levelsRef.current);

        const volSeries = chart.addHistogramSeries({
          priceScaleId: "vol",
          priceFormat: { type: "volume" },
        });
        chart.priceScale("vol").applyOptions({
          scaleMargins: { top: 0.75, bottom: 0 },
        });

        const emaSeries = {
          e20: chart.addLineSeries({
            color: resolvedAccent,
            lineWidth: 1,
            title: EMA_STYLE.e20.title,
            visible: DEFAULT_PERSIST.emas.e20,
            priceLineVisible: false,
            lastValueVisible: false,
          }),
          e50: chart.addLineSeries({
            color: resolvedAmber,
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

        // Seed the OHLC legend from the last bar on mount
        const seedLast = barsRef.current[barsRef.current.length - 1];
        if (seedLast) {
          setOhlc({
            date: seedLast.ts.slice(0, 10),
            open: seedLast.open,
            high: seedLast.high,
            low: seedLast.low,
            close: seedLast.close,
            volume: seedLast.volume,
          });
        }

        chart.subscribeCrosshairMove((param) => {
          if (!param.time || !param.seriesData.get(candleSeries)) {
            const last = barsRef.current[barsRef.current.length - 1];
            if (last) {
              setOhlc({
                date: last.ts.slice(0, 10),
                open: last.open,
                high: last.high,
                low: last.low,
                close: last.close,
                volume: last.volume,
              });
            }
            return;
          }
          const bar = param.seriesData.get(candleSeries) as {
            open: number;
            high: number;
            low: number;
            close: number;
          };
          const vol = param.seriesData.get(volSeries) as { value: number } | undefined;
          const t = typeof param.time === "number" ? param.time : Number(param.time);
          setOhlc({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: vol?.value ?? 0,
          });
        });
      }
    );

    return () => {
      destroyed = true;
      aliveRef.current = false;
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

  // Levels update effect — covers "levels changed after chart was ready".
  // Price lines used to be drawn once at mount from a stale prop and never
  // redrawn (TK-02: card and chart could show two different stops).
  useEffect(() => {
    levelsRef.current = levels;
    if (seriesRef.current) {
      syncPriceLines(seriesRef.current, levels);
    }
    // chart not ready yet → syncPriceLines runs inside the mount effect's .then() above
  }, [levels, syncPriceLines]);

  if (initialBars.length === 0) {
    return <Empty message="No price history for this ticker." />;
  }

  return (
    <div className={className}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-2 px-0.5">
        {/* Range pills */}
        <div role="radiogroup" aria-label="Chart range" className="flex gap-1">
          {(["3M", "6M", "1Y", "2Y"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={activePeriod === p}
              onClick={() => applyPeriod(p)}
              className={[
                "px-2 py-0.5 rounded text-micro font-medium transition-colors",
                activePeriod === p
                  ? "bg-accent text-foreground"
                  : "bg-elevated text-muted hover:text-foreground",
              ].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>

        <span className="text-line text-micro">|</span>

        {/* EMA chips */}
        {(["e20", "e50", "e200"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={emas[key]}
            onClick={() =>
              setEmas((prev) => ({ ...prev, [key]: !prev[key] }))
            }
            className={[
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-micro font-medium border border-line bg-elevated transition-colors",
              emas[key] ? "text-foreground" : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: EMA_STYLE[key].color, opacity: emas[key] ? 1 : 0.35 }}
            />
            {key === "e20" ? "20" : key === "e50" ? "50" : "200"}
          </button>
        ))}

        <span className="text-line text-micro">|</span>

        {/* Log toggle */}
        <div className="flex items-center gap-1.5">
          <Toggle checked={logScale} onChange={setLogScale} label="Logarithmic Y-axis" />
          <span className="text-micro font-medium text-muted">log</span>
        </div>
      </div>

      {/* OHLC legend */}
      {ohlc && (
        <div className="mb-1 flex flex-wrap gap-3 px-0.5 text-data text-muted">
          <span>{ohlc.date}</span>
          <span>O <span className="text-foreground">{ohlc.open.toFixed(2)}</span></span>
          <span>H <span className="text-foreground">{ohlc.high.toFixed(2)}</span></span>
          <span>L <span className="text-foreground">{ohlc.low.toFixed(2)}</span></span>
          <span>
            C{" "}
            <span className={ohlc.close >= ohlc.open ? "text-pos" : "text-neg"}>
              {ohlc.close.toFixed(2)}
            </span>
          </span>
          <span>Vol <span className="text-foreground">{ohlc.volume.toLocaleString()}</span></span>
        </div>
      )}

      {/* Chart canvas */}
      <div className="relative w-full">
        <div ref={containerRef} className="w-full" />
        <span className="pointer-events-none absolute bottom-1 left-2 font-mono text-micro text-muted">
          Vol
        </span>
      </div>
    </div>
  );
}
