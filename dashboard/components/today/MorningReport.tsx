"use client";

import Link from "next/link";
import Collapsible from "@/components/ui/Collapsible";
import {
  asOf,
  groupNewsByTicker,
  nearTermEvents,
  useMorningReport,
  plain,
  type MorningEvent,
  type DayAheadEarning,
  type MorningReport as Report,
} from "@/lib/report";
import { NEUTRAL_BAND, toneClass, toneLabel } from "@/lib/macro";
import { eventShortName } from "@/lib/eventMeta";

function SessionTag({ session }: { session: "BMO" | "AMC" | "—" }) {
  // "—" used to render nothing, leaving a row with no date, time or session at
  // all — say the session is unconfirmed instead (MB-07).
  const cls =
    session === "BMO"
      ? "border-warn/50 text-warn bg-warn/10"
      : session === "AMC"
        ? "border-accent/50 text-accent bg-accent/10"
        : "border-line text-muted-2 bg-raised";
  return (
    <span className={`ml-1 rounded border px-1 py-px text-[11px] font-medium ${cls}`}>
      {session === "—" ? "time TBA" : session}
    </span>
  );
}

function EarningsRow({ e, when }: { e: DayAheadEarning; when: string }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <span className="w-12 shrink-0 font-mono text-[11px] text-muted-2">{when}</span>
      <span className={e.watchlist ? "text-accent" : "text-foreground/80"}>{e.ticker ?? e.event}</span>
      <SessionTag session={e.session} />
      {e.watchlist && <span className="font-mono text-[11px] text-accent">watchlist</span>}
    </li>
  );
}

function FutureChip({ symbol, change_pct }: { symbol: string; change_pct: number }) {
  const tone = change_pct > 0.02 ? "text-pos" : change_pct < -0.02 ? "text-neg" : "text-muted";
  return (
    <span className="whitespace-nowrap font-mono text-[11px]">
      <span className="text-muted">{symbol.replace("=F", "").replace("^", "")}</span>{" "}
      <span className={tone}>
        {change_pct >= 0 ? "+" : ""}
        {change_pct.toFixed(2)}%
      </span>
    </span>
  );
}

function eventLine(e: MorningEvent, today: string): string {
  const day = e.date === today ? "today" : "tmrw";
  const t = e.time_et ? ` ${e.time_et} ET` : "";
  return `${day}${t} · ${eventShortName(e.event, e.category, e.ticker)}`;
}

function Role({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="mb-1 flex gap-2 text-xs leading-relaxed">
      <span className="w-[68px] shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-2">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </p>
  );
}

/** One line for both macro gauges, saying the same thing once (MB-06). */
function ToneLine({ data }: { data: Report }) {
  const us = data.macro?.us_1d ?? null;
  const glob = data.macro?.global_1d ?? null;
  if (us === null && glob === null) {
    return <span className="text-muted">{plain(data.tone)}</span>;
  }
  const same = us !== null && glob !== null && Math.abs(us - glob) < 0.01;
  const bothNeutral =
    (us === null || Math.abs(us) <= NEUTRAL_BAND) && (glob === null || Math.abs(glob) <= NEUTRAL_BAND);
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  return (
    <span>
      {bothNeutral ? (
        <span className="text-muted">
          News tone is inside the ±{NEUTRAL_BAND.toFixed(2)} neutral band {same ? "" : "on both scopes "}
          — no directional read
          {us !== null && <span className="ml-1 font-mono text-muted-2">({fmt(us)})</span>}.
        </span>
      ) : same ? (
        <span>
          US and global news tone both read{" "}
          <span className={`font-mono ${toneClass(us!)}`}>
            {toneLabel(us!)} {fmt(us!)}
          </span>
          .
        </span>
      ) : (
        <span>
          US{" "}
          {us !== null && (
            <span className={`font-mono ${toneClass(us)}`}>
              {toneLabel(us)} {fmt(us)}
            </span>
          )}{" "}
          · global{" "}
          {glob !== null && (
            <span className={`font-mono ${toneClass(glob)}`}>
              {toneLabel(glob)} {fmt(glob)}
            </span>
          )}
          .
        </span>
      )}{" "}
      <Link href="/macro" className="text-muted hover:text-accent">
        why ›
      </Link>
    </span>
  );
}

export function MorningReport() {
  const { data, error, isLoading } = useMorningReport();

  if (isLoading) {
    return (
      <section
        className="mb-5 rounded-md border border-line bg-elevated p-4"
        aria-label="Loading Morning Brief"
      >
        <div className="mb-3 h-4 w-32 animate-pulse rounded bg-raised" />
        <div className="mb-2 h-3 w-full animate-pulse rounded bg-raised" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-raised" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="mb-5 rounded-md border border-line bg-elevated p-4">
        <p className="text-[12px] text-muted">
          Couldn&rsquo;t load the morning brief. It refreshes every 5 minutes — try reloading.
        </p>
      </section>
    );
  }

  if (!data) return null;

  const stamp = asOf(data.generated_at);
  const news = groupNewsByTicker(data.day_ahead?.watchlist_news ?? []).slice(0, 5);
  const near = nearTermEvents(data.macro_events, data.date);
  const laterCount = data.macro_events.length - near.length;
  const earningsToday = data.day_ahead?.earnings_today ?? [];
  const earningsTomorrow = data.day_ahead?.earnings_tomorrow ?? [];
  const hasDayAheadEarnings = earningsToday.length > 0 || earningsTomorrow.length > 0;

  return (
    <Collapsible
      className="mb-5 rounded-md border border-line bg-elevated p-4"
      persistKey="morning-report"
      defaultOpen
      trigger={
        <div className="flex flex-1 items-baseline justify-between">
          <h2 className="tick text-[13px] font-semibold text-foreground">Morning Brief</h2>
          <span className="font-mono text-[11px] text-muted">
            {data.weekday} {data.date}
            {stamp && <span className="ml-2 text-muted-2">built {stamp}</span>}
          </span>
        </div>
      }
    >
      <div className="mb-2">
        {data.day_ahead && data.day_ahead.synthesis !== "Quiet slate." && (
          <Role label="Setup">{data.day_ahead.synthesis}</Role>
        )}
        {data.day_ahead?.gex_line && (
          <Role label="Positioning">
            {/* the most actionable line in the brief — no longer the faintest (MB-04) */}
            <span className="font-mono text-xs text-foreground">{data.day_ahead.gex_line}</span>
          </Role>
        )}
        <Role label="Tone">
          <ToneLine data={data} />
        </Role>
      </div>

      {data.futures.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.futures.map((f) => (
            <FutureChip key={f.symbol} symbol={f.symbol} change_pct={f.change_pct} />
          ))}
        </div>
      )}

      {news.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {news.map((n) => (
            <Link
              key={n.ticker}
              href={`/t/${n.ticker}`}
              className="flex items-baseline gap-2 text-[12px] text-foreground/90 hover:text-accent"
            >
              <span className="w-12 shrink-0 font-mono text-[11px] text-accent">${n.ticker}</span>
              <span className="min-w-0 flex-1 truncate" title={n.headline}>
                {n.headline}
              </span>
              {n.extra > 0 && (
                <span className="shrink-0 font-mono text-[11px] text-muted-2">+{n.extra} more</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">
            Macro — today &amp; tomorrow
          </div>
          {near.length > 0 ? (
            <ul className="space-y-0.5 font-mono text-[11px] text-foreground/80">
              {near.map((e, i) => (
                <li key={i}>
                  <span className={e.importance === "high" ? "text-warn" : "text-muted"}>•</span>{" "}
                  {eventLine(e, data.date)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[11px] text-muted-2">nothing scheduled</p>
          )}
          <Link href="/calendar" className="mt-0.5 inline-block font-mono text-[11px] text-muted hover:text-accent">
            {laterCount > 0 ? `+${laterCount} later this week · calendar ›` : "calendar ›"}
          </Link>
        </div>

        <div>
          <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">Earnings</div>
          {hasDayAheadEarnings ? (
            <ul className="space-y-0.5 font-mono text-[11px]">
              {earningsToday.slice(0, 3).map((e, i) => (
                <EarningsRow key={`t${i}`} e={e} when="today" />
              ))}
              {earningsTomorrow.slice(0, 2).map((e, i) => (
                <EarningsRow key={`m${i}`} e={e} when="tmrw" />
              ))}
            </ul>
          ) : data.earnings.length > 0 ? (
            <ul className="space-y-0.5 font-mono text-[11px] text-foreground/80">
              {data.earnings.slice(0, 4).map((e, i) => (
                <li key={i} className="flex items-baseline gap-1.5">
                  <span className="w-12 shrink-0 text-muted-2">{e.date.slice(5)}</span>
                  <span>{e.ticker ?? e.event}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[11px] text-muted-2">none in the next 7 days</p>
          )}
        </div>
      </div>

      <Link
        href="/brief"
        className="mt-3 inline-block font-mono text-[11px] text-muted hover:text-accent"
      >
        Full brief ›
      </Link>
    </Collapsible>
  );
}
