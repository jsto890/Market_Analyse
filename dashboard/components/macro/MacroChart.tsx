"use client";

import { useEffect, useRef } from "react";
import type { MacroPoint } from "@/lib/macro";

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

  useEffect(() => {
    let destroyed = false;
    import("lightweight-charts").then(({ createChart, ColorType }) => {
      if (destroyed || !ref.current) return;
      const chart = createChart(ref.current, {
        autoSize: true,
        height: 320,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b93a3" },
        grid: { vertLines: { visible: false }, horzLines: { color: "#161b24" } },
        rightPriceScale: { borderColor: "#222936" },
        leftPriceScale: { visible: true, borderColor: "#222936" },
        timeScale: { borderColor: "#222936", timeVisible: true },
      });

      const macro = chart.addLineSeries({
        color: "#2f81f7", priceScaleId: "left", lineWidth: 2, title: "macro",
      });
      macro.setData(clean(points.map((p) => ({ time: toSec(p.ts), value: p.score }))) as never);

      if (spx.length) {
        const spy = chart.addLineSeries({
          color: "#8b93a3", priceScaleId: "right", lineWidth: 1, title: "SPY",
          priceLineVisible: false, lastValueVisible: false,
        });
        spy.setData(clean(spx.map((b) => ({ time: toSec(b.ts), value: b.Close }))) as never);
      }

      chart.timeScale().fitContent();
      (ref.current as HTMLDivElement & { _chart?: unknown })._chart = chart;
    });

    return () => {
      destroyed = true;
      const el = ref.current as (HTMLDivElement & { _chart?: { remove: () => void } }) | null;
      el?._chart?.remove();
    };
  }, [points, spx]);

  return <div ref={ref} className="w-full" />;
}
