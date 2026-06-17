"use client";

import { useMorningReport, plain, type MorningEvent } from "@/lib/report";

function FutureChip({ symbol, change_pct }: { symbol: string; change_pct: number }) {
  const tone = change_pct > 0.02 ? "text-accent" : change_pct < -0.02 ? "text-warn" : "text-muted";
  return (
    <span className="font-mono text-[11px] whitespace-nowrap">
      <span className="text-muted">{symbol.replace("=F", "").replace("^", "")}</span>{" "}
      <span className={tone}>{change_pct >= 0 ? "+" : ""}{change_pct.toFixed(2)}%</span>
    </span>
  );
}

function eventLine(e: MorningEvent): string {
  const t = e.time_et ? ` ${e.time_et}` : "";
  return `${e.date.slice(5)}${t} · ${e.event}`;
}

export function MorningReport() {
  const { data } = useMorningReport();
  if (!data) return null;

  return (
    <section className="mb-5 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold">Morning Brief</h2>
        <span className="text-[11px] font-mono text-muted">{data.weekday} {data.date}</span>
      </div>
      <p className="text-xs text-foreground/90 leading-relaxed mb-2">{plain(data.tone)}</p>

      {data.futures.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 border-t border-line pt-2">
          {data.futures.map((f) => <FutureChip key={f.symbol} {...f} />)}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
        {data.macro_events.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">What to expect</div>
            <ul className="text-[11px] font-mono text-foreground/80 space-y-0.5">
              {data.macro_events.slice(0, 4).map((e, i) => (
                <li key={i}>
                  <span className={e.importance === "high" ? "text-warn" : "text-muted"}>•</span> {eventLine(e)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.earnings.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">Earnings</div>
            <ul className="text-[11px] font-mono text-foreground/80 space-y-0.5">
              {data.earnings.slice(0, 4).map((e, i) => (
                <li key={i}>{e.date.slice(5)} · {e.ticker ?? e.event}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
