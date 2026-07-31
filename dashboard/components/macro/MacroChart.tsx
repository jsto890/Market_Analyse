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
        timeScale: { borderColor: tokens.lineStrong, timeVisible: true },
      });

      const macro = chart.addLineSeries({
        color: tokens.accent, priceScaleId: "left", lineWidth: 2, title: "macro",
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
          axisLabelVisible: level !== 0,
          title: level === 0 ? "" : `${level > 0 ? "+" : ""}${level.toFixed(2)} neutral edge`,
        });
      }

      if (spx.length) {
        const spy = chart.addLineSeries({
          color: tokens.muted, priceScaleId: "right", lineWidth: 1, title: "SPY",
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

      chart.timeScale().fitContent();
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
