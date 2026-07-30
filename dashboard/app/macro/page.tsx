"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useMacro, useMacroSeries, scopeLabel, toneClass } from "@/lib/macro";
import { MacroChart, type SpxBar } from "@/components/macro/MacroChart";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
const WINDOWS = ["1h", "1d", "1w"];

export default function MacroPage() {
  const { data } = useMacro();
  const [scope, setScope] = useState("global");
  const [window, setWindow] = useState("1d");
  const { data: series } = useMacroSeries(scope, window);
  // SPY daily history already served by Argus; reuse it as the benchmark overlay.
  const { data: hist } = useSWR<{ bars: SpxBar[] }>(
    "/api/argus/history/SPY?period=1mo&interval=1d", fetcher, { shouldRetryOnError: false });

  const gauges = (data?.gauges ?? []).filter((g) => g.window === window);
  const anyData = (data?.gauges ?? []).length > 0;

  useEffect(() => {
    const stillValid = (data?.gauges ?? []).some((g) => g.window === window && g.scope === scope);
    if (!stillValid) setScope("global");
  }, [window, data, scope]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-6">
      <PageHeader
        title="Macro Sentiment"
        subtitle="FinBERT-scored news, recency-weighted by scope. −1 bearish · +1 bullish."
      />

      <div className="flex gap-2 mb-4">
        {WINDOWS.map((w) => (
          <button key={w} onClick={() => setWindow(w)}
            className={`px-2 py-1 text-xs rounded ${w === window ? "bg-accent/20 text-accent" : "bg-elevated text-muted"}`}>
            {w}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {gauges.map((g) => (
          <button key={g.scope} onClick={() => setScope(g.scope)}
            className={`text-left p-2 rounded border ${g.scope === scope ? "border-accent" : "border-line"} bg-surface`}>
            <div className="text-[11px] text-muted truncate">{scopeLabel(g.scope)}</div>
            <div className={`font-mono text-sm tabular-nums ${toneClass(g.score)}`}>
              {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
            </div>
            <div className="font-mono text-[10px] text-muted opacity-60">n={g.n}</div>
          </button>
        ))}
      </div>

      {anyData ? (
        <>
          <div className="mb-2 flex items-center gap-4 text-xs text-muted">
            <span>{scopeLabel(scope)} · {window}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-accent" />
              Macro
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-muted" />
              SPY
            </span>
          </div>
          <MacroChart points={series?.points ?? []} spx={hist?.bars ?? []} />
        </>
      ) : (
        <EmptyState message="No macro data yet — the aggregator runs every 20 min." />
      )}
    </main>
  );
}
