"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from "lightweight-charts";
import Empty from "@/components/ui/Empty";
import Toggle from "@/components/ui/Toggle";
import { visibleRangeFor, type ChartPeriod as Period } from "@/lib/chart-range";
import {
  CANDLE_CHART_PALETTE,
  FALLBACK_CHART_TOKENS,
  PRICE_LINE_STYLE,
  VOLUME_FILL_ALPHA,
  hexWithAlpha,
  resolveChartTokens,
  type ChartTokens,
  type PriceLineKind,
} from "@/lib/chartConventions";

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
  emas: EmaToggles;
  log: boolean;
}
const DEFAULT_PERSIST: PersistedState = {
  emas: { e20: true, e50: true, e200: false },
  log: false,
};

/** One horizontal line and the chip that names it at the right edge. */
interface PriceLineSpec {
  kind: PriceLineKind;
  price: number;
}

/** The chip is DOM, not canvas, so it names its tokens directly: a tint and a
 *  border matching its line, and `--raised` for the last price (K-08). */
const CHIP_CLASS: Record<PriceLineKind, string> = {
  target: "border-pos/35 bg-pos/10 text-pos",
  entry: "border-accent/35 bg-accent/10 text-accent",
  stop: "border-neg/35 bg-neg/10 text-neg",
  last: "border-line-strong bg-raised text-foreground",
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
  /** The visible window. Owned by `TickerChartSection` so the switch can sit in
   *  the chart panel's header instead of above the canvas (K-11). */
  period: Period;
  levels?: Level[];
  markers?: Marker[];
  height?: number;
  className?: string;
}

const EMA_STYLE = {
  e20: { token: CANDLE_CHART_PALETTE.ema20, cssColor: "var(--accent)", title: "EMA 20" },
  e50: { token: CANDLE_CHART_PALETTE.ema50, cssColor: "var(--amber)", title: "EMA 50" },
  e200: { token: CANDLE_CHART_PALETTE.ema200, cssColor: "var(--muted)", title: "EMA 200" },
} as const;
const EMA_PERIOD = { e20: 20, e50: 50, e200: 200 } as const;

export default function CandleChart({
  ticker,
  initialBars,
  period,
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
  const tokensRef = useRef<ChartTokens>(FALLBACK_CHART_TOKENS);

  const [emas, setEmas] = useState<EmaToggles>(DEFAULT_PERSIST.emas);
  const [logScale, setLogScale] = useState(DEFAULT_PERSIST.log);
  const [ohlc, setOhlc] = useState<
    { date: string; open: number; high: number; low: number; close: number; volume: number } | null
  >(null);
  const [chips, setChips] = useState<{ kind: PriceLineKind; price: number; y: number }[]>([]);
  const periodRef = useRef<Period>(period);
  const chartReady = useRef(false);

  // Target, entry, stop and the last close, in the order they are drawn. A
  // level the scorer did not issue contributes no line and no chip.
  //
  // Keyed by content, not by array identity: `levels` defaults to a fresh `[]`
  // on every render, and an identity-keyed memo would tear down and redraw
  // every price line each time.
  const levelKey = levels.map((l) => `${l.kind}:${l.price}`).join("|");
  const lastClose = initialBars.length > 0 ? initialBars[initialBars.length - 1].close : null;
  const priceLineSpecs = useMemo<PriceLineSpec[]>(() => {
    const specs: PriceLineSpec[] = [];
    for (const kind of ["target", "entry", "stop"] as const) {
      const level = levels.find((l) => l.kind === kind);
      if (level && Number.isFinite(level.price)) specs.push({ kind, price: level.price });
    }
    if (lastClose != null) specs.push({ kind: "last", price: lastClose });
    return specs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelKey, lastClose]);
  const specsRef = useRef<PriceLineSpec[]>(priceLineSpecs);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dash:chart:${ticker}`);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedState>;
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
      localStorage.setItem(`dash:chart:${ticker}`, JSON.stringify({ emas, log: logScale }));
    } catch {
      // ignore quota errors
    }
  }, [ticker, emas, logScale]);

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

    const t = tokensRef.current;

    seriesRef.current.setMarkers(
      markers.map((m) => ({
        time: toUTC(m.date),
        position: "belowBar" as const,
        shape: "arrowUp" as const,
        color: t[CANDLE_CHART_PALETTE.marker],
        ...(m.label ? { text: m.label } : {}),
      }))
    );

    const volData = bars.map((b) => ({
      time: toUTC(b.ts),
      value: b.volume,
      color: hexWithAlpha(
        b.close >= b.open ? t[CANDLE_CHART_PALETTE.up] : t[CANDLE_CHART_PALETTE.down],
        VOLUME_FILL_ALPHA
      ),
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

  const syncPriceLines = useCallback(
    (series: ISeriesApi<"Candlestick">, specs: PriceLineSpec[]) => {
      for (const pl of priceLinesRef.current) {
        series.removePriceLine(pl);
      }
      const t = tokensRef.current;
      priceLinesRef.current = specs.map((s) => {
        const style = PRICE_LINE_STYLE[s.kind];
        return series.createPriceLine({
          price: s.price,
          color: t[style.token],
          lineWidth: 1,
          lineStyle: (style.dashed ? 2 : 0) as 0 | 1 | 2 | 3 | 4,
          // The chip at the right edge is ours: the library's own axis label
          // cannot carry a border or a tint, and the mock's does both (K-08).
          axisLabelVisible: false,
          title: "",
        });
      });
    },
    []
  );

  // Right-edge chips track the price scale, so they are repositioned whenever
  // it can have moved: new data, new levels, a new period, a resize.
  const refreshChips = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    const next: { kind: PriceLineKind; price: number; y: number }[] = [];
    for (const s of specsRef.current) {
      const y = series.priceToCoordinate(s.price);
      if (y != null) next.push({ kind: s.kind, price: s.price, y });
    }
    // Keep the previous array when nothing moved: this runs from effects whose
    // deps include caller-supplied arrays, and a fresh array every time would
    // re-render forever.
    setChips((prev) =>
      prev.length === next.length &&
      prev.every((p, i) => p.kind === next[i].kind && p.price === next[i].price && p.y === next[i].y)
        ? prev
        : next
    );
  }, []);

  // Visible window, driven by the period control in the panel header
  useEffect(() => {
    periodRef.current = period;
    const bars = barsRef.current;
    if (!chartRef.current || !chartReady.current || bars.length < 2) return;
    const { from, to } = visibleRangeFor(
      period,
      toUTC(bars[0].ts) as number,
      toUTC(bars[bars.length - 1].ts) as number
    );
    chartRef.current.timeScale().setVisibleRange({
      from: from as UTCTimestamp,
      to: to as UTCTimestamp,
    });
    refreshChips();
  }, [period, refreshChips]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => refreshChips());
    ro.observe(el);
    return () => ro.disconnect();
  }, [refreshChips]);

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
      ({ createChart, ColorType }) => {
        if (destroyed || !containerRef.current) return;

        // lightweight-charts hands series/price-line colors straight to the Canvas 2D
        // context (and, for price-line/last-value axis labels, through its own color
        // parser which throws on unrecognized strings) — raw `var(--x)` strings are not
        // resolved in either path, so resolve the CSS custom properties once here.
        // Which token stands for which surface is stated in CANDLE_CHART_PALETTE.
        const t = resolveChartTokens();
        tokensRef.current = t;

        const chart = createChart(containerRef.current, {
          autoSize: true,
          height,
          layout: {
            background: { type: ColorType.Solid, color: t[CANDLE_CHART_PALETTE.background] },
            textColor: t[CANDLE_CHART_PALETTE.text],
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: t[CANDLE_CHART_PALETTE.grid] },
            horzLines: { color: t[CANDLE_CHART_PALETTE.grid] },
          },
          rightPriceScale: {
            borderColor: t[CANDLE_CHART_PALETTE.border],
            scaleMargins: { top: 0.1, bottom: 0.3 },
          },
          timeScale: { borderColor: t[CANDLE_CHART_PALETTE.border] },
        });

        const candleSeries = chart.addCandlestickSeries({
          upColor: t[CANDLE_CHART_PALETTE.up],
          downColor: t[CANDLE_CHART_PALETTE.down],
          wickUpColor: t[CANDLE_CHART_PALETTE.up],
          wickDownColor: t[CANDLE_CHART_PALETTE.down],
          borderVisible: false,
          // The last price is one of our own price lines, drawn white and
          // solid with a `--raised` chip; the series' built-in one would be a
          // second line in the candle colour on top of it.
          priceLineVisible: false,
          lastValueVisible: false,
        });

        // initial draw only — the specs effect below keeps these in sync with
        // the `levels` prop as live action_card data arrives (TK-02)
        syncPriceLines(candleSeries, specsRef.current);

        const volSeries = chart.addHistogramSeries({
          priceScaleId: "vol",
          priceFormat: { type: "volume" },
        });
        chart.priceScale("vol").applyOptions({
          scaleMargins: { top: 0.75, bottom: 0 },
        });

        const emaSeries = {
          e20: chart.addLineSeries({
            color: t[EMA_STYLE.e20.token],
            lineWidth: 1,
            title: EMA_STYLE.e20.title,
            visible: DEFAULT_PERSIST.emas.e20,
            priceLineVisible: false,
            lastValueVisible: false,
          }),
          e50: chart.addLineSeries({
            color: t[EMA_STYLE.e50.token],
            lineWidth: 1,
            title: EMA_STYLE.e50.title,
            visible: DEFAULT_PERSIST.emas.e50,
            priceLineVisible: false,
            lastValueVisible: false,
          }),
          e200: chart.addLineSeries({
            color: t[EMA_STYLE.e200.token],
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
        refreshChips();
        chart.timeScale().subscribeVisibleTimeRangeChange(() => refreshChips());

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
      refreshChips();
    }
    // chart not ready yet → applyData will be called inside the .then above
  }, [initialBars, applyData, refreshChips]);

  // Price-line update effect — covers "levels changed after chart was ready".
  // Price lines used to be drawn once at mount from a stale prop and never
  // redrawn (TK-02: card and chart could show two different stops).
  useEffect(() => {
    specsRef.current = priceLineSpecs;
    if (seriesRef.current) {
      syncPriceLines(seriesRef.current, priceLineSpecs);
      refreshChips();
    }
    // chart not ready yet → syncPriceLines runs inside the mount effect's .then() above
  }, [priceLineSpecs, syncPriceLines, refreshChips]);

  if (initialBars.length === 0) {
    return <Empty message="No price history for this ticker." />;
  }

  return (
    <div className={className}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-2 px-0.5">
        {/* Range lives in the panel header (K-11); these are the overlays. */}
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
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-data border border-line bg-elevated transition-colors",
              emas[key] ? "text-foreground" : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: EMA_STYLE[key].cssColor, opacity: emas[key] ? 1 : 0.35 }}
            />
            {key === "e20" ? "20" : key === "e50" ? "50" : "200"}
          </button>
        ))}

        <span className="text-line text-micro">|</span>

        {/* Log toggle */}
        <div className="flex items-center gap-1.5">
          <Toggle checked={logScale} onChange={setLogScale} label="Logarithmic Y-axis" />
          <span className="text-label text-muted">log</span>
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
        {/* Entry, stop, target and the last price, named at the right edge
            where the lines end — the numbers used to sit in a card 300px
            away from the prices they describe (K-08). */}
        {chips.map((c) => (
          <span
            key={c.kind}
            className={`pointer-events-none absolute right-0 -translate-y-1/2 rounded-[3px] border p-[1px_5px] text-data ${CHIP_CLASS[c.kind]}`}
            style={{ top: c.y }}
          >
            {PRICE_LINE_STYLE[c.kind].prefix
              ? `${PRICE_LINE_STYLE[c.kind].prefix} ${c.price.toFixed(2)}`
              : c.price.toFixed(2)}
          </span>
        ))}
        <span className="pointer-events-none absolute bottom-1 left-2 font-mono text-micro text-muted">
          Vol
        </span>
      </div>
    </div>
  );
}
