"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import { fullDayLabel, importanceChipClass } from "@/lib/calendar";
import { CATEGORY_LABEL, IMPORTANCE_LABEL, eventShortName } from "@/lib/eventMeta";
import { NEUTRAL_BAND, toneClass, toneLabel } from "@/lib/macro";
import { asOf, groupNewsByTicker, useMorningReport, plain, type MorningEvent } from "@/lib/report";

function Gauge({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="font-mono text-[12px] text-muted-2">{label} —</span>;
  }
  return (
    <span className="font-mono text-[12px]">
      <span className="text-muted">{label} </span>
      <span className={toneClass(value)}>
        {value >= 0 ? "+" : ""}
        {value.toFixed(2)} {toneLabel(value)}
      </span>
    </span>
  );
}

function EventList({ events, today }: { events: MorningEvent[]; today: string }) {
  if (events.length === 0) return <p className="text-[12px] text-muted">Nothing scheduled.</p>;
  return (
    <ul className="space-y-1">
      {events.map((e, i) => (
        <li key={`${e.event}-${e.date}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={`rounded border px-1 py-px font-mono text-[10px] uppercase ${importanceChipClass(e.importance)}`}
          >
            {IMPORTANCE_LABEL[e.importance] ?? e.importance}
          </span>
          <span className="font-mono text-[11px] text-muted">
            {e.date === today ? "today" : fullDayLabel(e.date)}
          </span>
          <span className="text-[12px] text-foreground">
            {eventShortName(e.event, e.category, e.ticker)}
          </span>
          <span className="font-mono text-[11px] text-muted-2">
            {e.time_et ? `${e.time_et} ET` : "time TBA"} · {CATEGORY_LABEL[e.category] ?? e.category}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function BriefPage() {
  const { data, error, isLoading } = useMorningReport({ limit: 40, days: 14 });

  if (isLoading && !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <p className="font-mono text-[11px] text-muted">loading brief…</p>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <EmptyState message="The morning brief is unavailable — the Argus API isn't answering." />
      </main>
    );
  }

  const stamp = asOf(data.generated_at);
  const news = groupNewsByTicker(data.day_ahead?.watchlist_news ?? []);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-6">
      <PageHeader
        title="Morning Brief"
        subtitle={`${data.weekday} ${data.date}${stamp ? ` · built ${stamp}` : ""} · next 14 days of scheduled risk`}
        actions={
          <Link href="/calendar" className="text-[12px] text-muted hover:text-accent">
            Calendar ›
          </Link>
        }
      />

      <Panel title="The day">
        <div className="space-y-2 text-[13px] leading-relaxed">
          {data.day_ahead && <p className="text-foreground">{data.day_ahead.synthesis}</p>}
          {data.day_ahead?.gex_line && (
            <p className="font-mono text-[12px] text-foreground">{data.day_ahead.gex_line}</p>
          )}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Gauge label="US 1d" value={data.macro?.us_1d} />
            <Gauge label="Global 1d" value={data.macro?.global_1d} />
            <span className="text-[11px] text-muted-2">
              ±{NEUTRAL_BAND.toFixed(2)} reads as neutral
            </span>
            <Link href="/macro" className="text-[12px] text-muted hover:text-accent">
              sentiment detail ›
            </Link>
          </p>
          <p className="text-[12px] text-muted">{plain(data.tone)}</p>
          {data.futures.length > 0 && (
            <p className="flex flex-wrap gap-x-3 font-mono text-[12px]">
              {data.futures.map((f) => (
                <span key={f.symbol}>
                  <span className="text-muted">{f.symbol.replace("=F", "").replace("^", "")} </span>
                  <span className={f.change_pct >= 0 ? "text-pos" : "text-neg"}>
                    {f.change_pct >= 0 ? "+" : ""}
                    {f.change_pct.toFixed(2)}%
                  </span>
                </span>
              ))}
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Macro schedule" count={data.macro_events.length}>
        <EventList events={data.macro_events} today={data.date} />
      </Panel>

      <Panel title="Earnings" count={data.earnings.length}>
        <EventList events={data.earnings} today={data.date} />
      </Panel>

      <Panel title="Watchlist news" count={news.length}>
        {news.length === 0 ? (
          <p className="text-[12px] text-muted">Nothing on tracked names.</p>
        ) : (
          <ul className="space-y-1">
            {news.map((n) => (
              <li key={n.ticker} className="flex items-baseline gap-2">
                <Link href={`/t/${n.ticker}`} className="w-14 shrink-0 font-mono text-[12px] text-accent">
                  ${n.ticker}
                </Link>
                <span className="min-w-0 flex-1 text-[12px] text-foreground">{n.headline}</span>
                {n.extra > 0 && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-2">+{n.extra} more</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Headlines" count={data.headlines.length}>
        <ul className="space-y-1">
          {data.headlines.map((h, i) => (
            <li key={i} className="flex items-baseline gap-2">
              {h.ticker ? (
                <Link href={`/t/${h.ticker}`} className="w-14 shrink-0 font-mono text-[12px] text-accent">
                  ${h.ticker}
                </Link>
              ) : (
                <span className="w-14 shrink-0 font-mono text-[11px] text-muted-2">{h.source}</span>
              )}
              <span className="min-w-0 flex-1 text-[12px] text-foreground">{h.headline}</span>
              {Boolean(h.is_breaking) && (
                <span className="shrink-0 font-mono text-[11px] text-warn">breaking</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </main>
  );
}
