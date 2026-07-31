"use client";

import { useEffect, useRef } from "react";
import { NEUTRAL_BAND, type MacroPoint } from "@/lib/macro";
import { CHART_HEIGHT, resolveChartTokens } from "@/lib/chartConventions";

export interface SpxBar { ts: string; Close: number }

const toSec = (ts: string) => Math.floor(new Date(ts.replace(" ", "T")).getTime() / 1000);

/** Ascending, de-duplicated {time, value} for lightweight-charts (it throws on
 *  unsorted or duplicate times). */
function clean(rows: { time: number; value: number }[]) {
  const seen = new Set<number>();
  return rows
    .filter((d) => Number.isFinite(d.time) && Number.isFinite(d.value))
    .sort((a, b) => a.time - b.time)
    .filter((d) => (seen.has(d.time) ? false : (seen.add(d.time), true)));
}

/** Macro score (left axis, −1..1) overlaid on SPY close (right axis). */
export function MacroChart({ points, spx }: { points: MacroPoint[]; spx: SpxBar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasData = points.length > 0 || spx.length > 0;

  useEffect(() => {
    if (!hasData) return;
    let destroyed = false;
    import("lightweight-charts").then(({ createChart, ColorType }) => {
      if (destroyed || !ref.current) return;
      const tokens = resolveChartTokens(ref.current);
      const chart = createChart(ref.current, {
        autoSize: true,
        height: 320,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: tokens.muted, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: tokens.line } },
        rightPriceScale: { borderColor: tokens.lineStrong },
        leftPriceScale: { visible: true, borderColor: tokens.lineStrong },
        // secondsVisible off and a uniform tick format: with timeVisible alone
        // the axis interleaved bare day numbers with clock times ("20 · 12:13 ·
        // 21 · 12:01"), which reads as two different scales on one axis.
        timeScale: {
          borderColor: tokens.lineStrong,
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: number) => {
            const d = new Date(time * 1000);
            return `${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
              d.getMinutes()
            ).padStart(2, "0")}`;
          },
        },
      });

      // No series `title`: lightweight-charts paints it as a pill pinned to the
      // left edge, directly over the price-scale ticks. The legend row above the
      // chart already names both series.
      const macro = chart.addLineSeries({
        color: tokens.accent, priceScaleId: "left", lineWidth: 2,
      });
      const macroData = clean(points.map((p) => ({ time: toSec(p.ts), value: p.score })));
      macro.setData(macroData as never);

      // The ±0.05 neutral band was applied invisibly in toneClass — draw it
      // so a +0.04 reading is visibly inside the band, not just muted (MAC-06).
      for (const level of [NEUTRAL_BAND, 0, -NEUTRAL_BAND]) {
        macro.createPriceLine({
          price: level,
          color: level === 0 ? tokens.lineStrong : tokens.line,
          lineWidth: 1,
          lineStyle: 2,
          // No axis pill and no title: both render at the left edge on top of
          // the price-scale ticks (measured collision — "+0.05 neutral edge"
          // overprinted the 0.05/0.04 labels). The dashed lines carry the band,
          // and the legend above the chart states the ±0.05 threshold.
          axisLabelVisible: false,
        });
      }

      if (spx.length) {
        const spy = chart.addLineSeries({
          color: tokens.muted, priceScaleId: "right", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false,
        });
        // Clip the benchmark to the sentiment span — otherwise a longer bar
        // history compresses the macro line into the right edge.
        const from = macroData.length ? macroData[0].time : -Infinity;
        const to = macroData.length ? macroData[macroData.length - 1].time : Infinity;
        const bars = clean(spx.map((b) => ({ time: toSec(b.ts), value: b.Close })))
          .filter((b) => b.time >= from && b.time <= to);
        spy.setData((bars.length ? bars : []) as never);
      }

      // fitContent alone puts the first data point at x=0, so the leftmost tick
      // label ("20 10:05") is drawn centred on the edge and loses its leading
      // digit. Pad the logical range by a couple of bars so every tick label
      // has room to render whole.
      const ts = chart.timeScale();
      ts.fitContent();
      const range = ts.getVisibleLogicalRange();
      if (range) ts.setVisibleLogicalRange({ from: range.from - 2, to: range.to + 2 });
      (ref.current as HTMLDivElement & { _chart?: unknown })._chart = chart;
    });

    return () => {
      destroyed = true;
      const el = ref.current as (HTMLDivElement & { _chart?: { remove: () => void } }) | null;
      el?._chart?.remove();
    };
  }, [points, spx, hasData]);

  if (!hasData) return null;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Macro sentiment score over time, overlaid on SPY"
      className="w-full"
      style={{ height: CHART_HEIGHT }}
    />
  );
}
