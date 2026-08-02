"use client";

import Link from "next/link";
import { useMacro, scopeLabel, toneClass, type MacroGauge } from "@/lib/macro";
import Loading from "@/components/ui/Loading";

/** A compact −1..1 bar centred at 0. The score is model output, so it takes
 * --model rather than P&L green/red; direction is carried by the bar's side. */
function Gauge({ g }: { g: MacroGauge }) {
  const pct = Math.max(-1, Math.min(1, g.score)) * 50; // ±50% from centre
  const pos = g.score >= 0;
  return (
    <div className="px-3 py-1">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow truncate">{scopeLabel(g.scope)}</span>
        <span className={`text-data ${toneClass(g.score)}`}>
          {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
        </span>
      </div>
      <div className="relative h-1 mt-0.5 bg-elevated overflow-hidden">
        {/* The zero tick has to read against the track it sits in, so it takes
         * line-strong; `line` is the same value the track edge already carries. */}
        <span className="absolute left-1/2 top-0 h-full w-px bg-line-strong" />
        <span
          className="absolute top-0 h-full bg-model"
          style={{ left: pos ? "50%" : `${50 + pct}%`, width: `${Math.abs(pct)}%` }}
        />
      </div>
    </div>
  );
}

export function MacroGauges({ window = "1d" }: { window?: string }) {
  const { data } = useMacro();
  const gauges = (data?.gauges ?? []).filter((g) => g.window === window);
  // Show global + us first, then up to 3 sectors with the most items.
  const head = gauges.filter((g) => g.scope === "global" || g.scope === "us");
  const sectors = gauges
    .filter((g) => g.scope.startsWith("sector:"))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const show = [...head, ...sectors];

  return (
    <div className="border-t border-line-strong">
      <div className="h-[24px] flex items-center justify-between px-3">
        <span className="eyebrow leading-none">Macro</span>
        <Link href={`/macro?window=${window}`} className="text-data leading-none text-muted hover:text-accent">{window} ›</Link>
      </div>
      {show.length === 0
        ? <Loading variant="lines" count={2} label="Building macro gauges" className="px-3 py-1.5" />
        : show.map((g) => <Gauge key={`${g.scope}-${g.window}`} g={g} />)}
    </div>
  );
}
