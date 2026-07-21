"use client";

import { useMorningReport, plain, type MorningEvent, type DayAheadEarning } from "@/lib/report";

function EarningsRow({ e }: { e: DayAheadEarning }) {
  return (
    <li>
      <span className={e.watchlist ? "text-accent" : "text-foreground/80"}>
        {e.ticker ?? e.event}
      </span>{" "}
      <span className="text-muted">{e.session}</span>
    </li>
  );
}

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
      {data.day_ahead && data.day_ahead.synthesis !== "Quiet slate." && (
        <p className="text-xs text-foreground leading-relaxed mb-1 font-medium" id="day-ahead">
          {data.day_ahead.synthesis}
        </p>
      )}
      {data.day_ahead?.gex_line && (
        <p className="text-[11px] font-mono text-muted leading-relaxed mb-1">
          {data.day_ahead.gex_line}
        </p>
      )}
      <p className="text-xs text-foreground/90 leading-relaxed mb-2">{plain(data.tone)}</p>
      {data.day_ahead && data.day_ahead.watchlist_news.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {data.day_ahead.watchlist_news.slice(0, 5).map((n, i) => (
            <a
              key={i}
              href={`/t/${n.ticker}`}
              title={n.headline}
              className="text-[10px] font-mono border border-line rounded px-1.5 py-px text-accent hover:bg-elevated"
            >
              ${n.ticker} news
            </a>
          ))}
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
        {data.day_ahead && (data.day_ahead.earnings_today.length > 0 || data.day_ahead.earnings_tomorrow.length > 0) ? (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">Earnings</div>
            <ul className="text-[11px] font-mono space-y-0.5">
              {data.day_ahead.earnings_today.slice(0, 3).map((e, i) => (
                <EarningsRow key={`t${i}`} e={e} />
              ))}
              {data.day_ahead.earnings_tomorrow.slice(0, 2).map((e, i) => (
                <li key={`m${i}`} className="text-muted">
                  tmrw · {e.ticker ?? e.event} {e.session}
                </li>
              ))}
            </ul>
          </div>
        ) : data.earnings.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">Earnings</div>
            <ul className="text-[11px] font-mono text-foreground/80 space-y-0.5">
              {data.earnings.slice(0, 4).map((e, i) => (
                <li key={i}>{e.date.slice(5)} · {e.ticker ?? e.event}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
