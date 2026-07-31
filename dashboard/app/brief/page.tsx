"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import { fullDayLabel, importanceChipClass } from "@/lib/calendar";
import { CATEGORY_LABEL, IMPORTANCE_LABEL, eventShortName } from "@/lib/eventMeta";
import { NEUTRAL_BAND, toneClass, toneLabel } from "@/lib/macro";
import { asOf, groupNewsByTicker, useMorningReport, plain, type MorningEvent } from "@/lib/report";
import PageShell from "@/components/PageShell";

function Gauge({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="font-mono text-dense text-muted-2">{label} —</span>;
  }
  return (
    <span className="font-mono text-dense">
      <span className="text-muted">{label} </span>
      <span className={toneClass(value)}>
        {value >= 0 ? "+" : ""}
        {value.toFixed(2)} {toneLabel(value)}
      </span>
    </span>
  );
}

function EventList({ events, today }: { events: MorningEvent[]; today: string }) {
  if (events.length === 0) return <p className="text-dense text-muted">Nothing scheduled.</p>;
  return (
    <ul className="space-y-1">
      {events.map((e, i) => (
        <li key={`${e.event}-${e.date}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={`rounded border px-1 py-px font-mono text-micro uppercase ${importanceChipClass(e.importance)}`}
          >
            {IMPORTANCE_LABEL[e.importance] ?? e.importance}
          </span>
          <span className="font-mono text-micro text-muted">
            {e.date === today ? "today" : fullDayLabel(e.date)}
          </span>
          <span className="text-dense text-foreground">
            {eventShortName(e.event, e.category, e.ticker)}
          </span>
          <span className="font-mono text-micro text-muted-2">
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
      <PageShell width="reading">
        <p className="font-mono text-micro text-muted">loading brief…</p>
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell width="reading">
        <EmptyState message="The morning brief is unavailable — the Argus API isn't answering." />
      </PageShell>
    );
  }

  const stamp = asOf(data.generated_at);
  const news = groupNewsByTicker(data.day_ahead?.watchlist_news ?? []);

  return (
    <PageShell width="reading">
      <PageHeader
        title="Morning Brief"
        subtitle={`${data.weekday} ${data.date}${stamp ? ` · built ${stamp}` : ""} · next 14 days of scheduled risk`}
        actions={
          <Link href="/calendar" className="text-dense text-muted hover:text-accent">
            Calendar ›
          </Link>
        }
      />

      <Panel title="The day">
        <div className="space-y-2 text-body leading-relaxed">
          {data.day_ahead && <p className="text-foreground">{data.day_ahead.synthesis}</p>}
          {data.day_ahead?.gex_line && (
            <p className="font-mono text-dense text-foreground">{data.day_ahead.gex_line}</p>
          )}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Gauge label="US 1d" value={data.macro?.us_1d} />
            <Gauge label="Global 1d" value={data.macro?.global_1d} />
            <span className="text-micro text-muted-2">
              ±{NEUTRAL_BAND.toFixed(2)} reads as neutral
            </span>
            <Link href="/macro" className="text-dense text-muted hover:text-accent">
              sentiment detail ›
            </Link>
          </p>
          <p className="text-dense text-muted">{plain(data.tone)}</p>
          {data.futures.length > 0 && (
            <p className="flex flex-wrap gap-x-3 font-mono text-dense">
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
          <p className="text-dense text-muted">Nothing on tracked names.</p>
        ) : (
          <ul className="space-y-1">
            {news.map((n) => (
              <li key={n.ticker} className="flex items-baseline gap-2">
                <Link href={`/t/${n.ticker}`} className="w-14 shrink-0 font-mono text-dense text-accent">
                  ${n.ticker}
                </Link>
                <span className="min-w-0 flex-1 text-dense text-foreground">{n.headline}</span>
                {n.extra > 0 && (
                  <span className="shrink-0 font-mono text-micro text-muted-2">+{n.extra} more</span>
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
                <Link href={`/t/${h.ticker}`} className="w-14 shrink-0 font-mono text-dense text-accent">
                  ${h.ticker}
                </Link>
              ) : (
                <span className="w-14 shrink-0 font-mono text-micro text-muted-2">{h.source}</span>
              )}
              <span className="min-w-0 flex-1 text-dense text-foreground">{h.headline}</span>
              {Boolean(h.is_breaking) && (
                <span className="shrink-0 font-mono text-micro text-warn">breaking</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </PageShell>
  );
}
