"use client";

import Link from "next/link";
import Failed from "@/components/ui/Failed";
import Loading from "@/components/ui/Loading";
import Stale from "@/components/ui/Stale";
import Panel from "@/components/ui/Panel";
import { fullDayLabel } from "@/lib/calendar";
import { CATEGORY_LABEL, eventShortName } from "@/lib/eventMeta";
import { NEUTRAL_BAND, toneClass, toneLabel } from "@/lib/macro";
import { groupNewsByTicker, useMorningReport, plain, type MorningEvent } from "@/lib/report";
import Page from "@/components/ui/Page";
import RankText from "@/components/ui/RankText";

function Gauge({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-data text-muted">{label} —</span>;
  }
  return (
    <span className="text-data">
      <span className="text-muted">{label} </span>
      <span className={toneClass(value)}>
        {value >= 0 ? "+" : ""}
        {value.toFixed(2)} {toneLabel(value)}
      </span>
    </span>
  );
}

function EventList({ events, today }: { events: MorningEvent[]; today: string }) {
  if (events.length === 0) return <p className="text-body text-muted">Nothing scheduled.</p>;
  return (
    <ul className="space-y-1">
      {events.map((e, i) => (
        <li key={`${e.event}-${e.date}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
          <RankText importance={e.importance} />
          <span className="text-data text-muted">
            {e.date === today ? "today" : fullDayLabel(e.date)}
          </span>
          <span className="text-body text-foreground">
            {eventShortName(e.event, e.category, e.ticker)}
          </span>
          <span className="text-data text-muted">
            {e.time_et && `${e.time_et} ET · `}
            {CATEGORY_LABEL[e.category] ?? e.category}
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
      <Page width="prose">
        <Loading count={6} label="Loading brief" />
      </Page>
    );
  }
  if (error || !data) {
    return (
      <Page width="prose">
        <Failed
          title="Morning brief unavailable"
          message="The Argus API isn't answering, so the brief could not be built."
        />
      </Page>
    );
  }

  const news = groupNewsByTicker(data.day_ahead?.watchlist_news ?? []);

  return (
    <Page width="prose">
      <Page.Header
        title="Morning Brief"
        subtitle={`${data.weekday} ${data.date} · next 14 days of scheduled risk`}
        status={<Stale asOf={data.generated_at} source="brief" expectStale />}
        actions={
          <Link href="/calendar" className="text-body text-muted hover:text-accent">
            Calendar ›
          </Link>
        }
      />

      <Panel title="The day">
        <div className="space-y-2 text-body leading-relaxed">
          {data.day_ahead && <p className="text-foreground">{data.day_ahead.synthesis}</p>}
          {data.day_ahead?.gex_line && (
            <p className="text-data text-foreground">{data.day_ahead.gex_line}</p>
          )}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Gauge label="US 1d" value={data.macro?.us_1d} />
            <Gauge label="Global 1d" value={data.macro?.global_1d} />
            <span className="text-body text-muted">
              ±{NEUTRAL_BAND.toFixed(2)} reads as neutral
            </span>
            <Link href="/macro" className="text-body text-muted hover:text-accent">
              sentiment detail ›
            </Link>
          </p>
          <p className="text-body text-2">{plain(data.tone)}</p>
          {data.futures.length > 0 && (
            <p className="flex flex-wrap gap-x-3 text-data">
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
          <p className="text-body text-muted">Nothing on tracked names.</p>
        ) : (
          <ul className="space-y-1">
            {news.map((n) => (
              <li key={n.ticker} className="flex items-baseline gap-2">
                <Link href={`/t/${n.ticker}`} className="w-14 shrink-0 text-data text-accent">
                  ${n.ticker}
                </Link>
                <span className="min-w-0 flex-1 text-body text-foreground">{n.headline}</span>
                {n.extra > 0 && (
                  <span className="shrink-0 text-data text-muted">+{n.extra} more</span>
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
                <Link href={`/t/${h.ticker}`} className="w-14 shrink-0 text-data text-accent">
                  ${h.ticker}
                </Link>
              ) : (
                <span className="w-14 shrink-0 truncate text-body text-muted">{h.source}</span>
              )}
              <span className="min-w-0 flex-1 text-body text-foreground">{h.headline}</span>
              {Boolean(h.is_breaking) && (
                <span className="shrink-0 text-label text-warn">breaking</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}
