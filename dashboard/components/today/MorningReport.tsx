"use client";

import Link from "next/link";
import Collapsible from "@/components/ui/Collapsible";
import Loading from "@/components/ui/Loading";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";
import {
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
  // No earnings row carries a time, so "—" is every row that has not been
  // hand-sessioned. A field with no feed renders nothing rather than a chip
  // that says so on all of them; the row still names its ticker and day.
  if (session === "—") return null;
  const cls =
    session === "BMO"
      ? "border-warn/50 text-warn bg-warn/10"
      : session === "AMC"
        ? "border-line-strong text-foreground bg-raised"
        : "border-line text-muted bg-raised";
  return (
    <span className={`ml-1 rounded border px-1 py-px text-micro font-medium ${cls}`}>
      {session}
    </span>
  );
}

function EarningsRow({ e, when }: { e: DayAheadEarning; when: string }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <span className="w-12 shrink-0 text-data text-muted">{when}</span>
      <span className={e.watchlist ? "text-data font-medium text-foreground" : "text-data text-2"}>
        {e.ticker ?? e.event}
      </span>
      <SessionTag session={e.session} />
      {e.watchlist && <span className="eyebrow">watchlist</span>}
    </li>
  );
}

function FutureChip({ symbol, change_pct }: { symbol: string; change_pct: number }) {
  const tone = change_pct > 0.02 ? "text-pos" : change_pct < -0.02 ? "text-neg" : "text-muted";
  return (
    <span className="whitespace-nowrap text-data">
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
    <p className="mb-1 flex gap-2 text-body leading-relaxed">
      {/* Wide enough for "Positioning" once the micro role uppercases it — a
       * shrink-0 box narrower than its own text overflows onto the sentence. */}
      <span className="w-[88px] shrink-0 eyebrow">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </p>
  );
}

/** One line for both macro gauges, saying the same thing once (MB-06). */
function ToneLine({ data }: { data: Report }) {
  const us = data.macro?.us_1d ?? null;
  const glob = data.macro?.global_1d ?? null;
  if (us === null && glob === null) {
    return <span className="text-2">{plain(data.tone)}</span>;
  }
  const same = us !== null && glob !== null && Math.abs(us - glob) < 0.01;
  const bothNeutral =
    (us === null || Math.abs(us) <= NEUTRAL_BAND) && (glob === null || Math.abs(glob) <= NEUTRAL_BAND);
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  return (
    <span>
      {bothNeutral ? (
        <span className="text-2">
          News tone is inside the ±{NEUTRAL_BAND.toFixed(2)} neutral band {same ? "" : "on both scopes "}
          — no directional read
          {us !== null && <span className="ml-1 text-data text-muted">({fmt(us)})</span>}.
        </span>
      ) : same ? (
        <span>
          US and global news tone both read{" "}
          <span className={`text-data ${toneClass(us!)}`}>
            {toneLabel(us!)} {fmt(us!)}
          </span>
          .
        </span>
      ) : (
        <span>
          US{" "}
          {us !== null && (
            <span className={`text-data ${toneClass(us)}`}>
              {toneLabel(us)} {fmt(us)}
            </span>
          )}{" "}
          · global{" "}
          {glob !== null && (
            <span className={`text-data ${toneClass(glob)}`}>
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
      <section className="rounded-md border border-line bg-elevated p-4">
        <Loading variant="lines" count={3} label="Loading Morning Brief" />
      </section>
    );
  }

  if (error) {
    return (
      <Failed
        title="Couldn’t load the morning brief"
        message="It refreshes every 5 minutes — try reloading."
      />
    );
  }

  if (!data) return null;

  const news = groupNewsByTicker(data.day_ahead?.watchlist_news ?? []).slice(0, 5);
  const near = nearTermEvents(data.macro_events, data.date);
  const laterCount = data.macro_events.length - near.length;
  const earningsToday = data.day_ahead?.earnings_today ?? [];
  const earningsTomorrow = data.day_ahead?.earnings_tomorrow ?? [];
  const hasDayAheadEarnings = earningsToday.length > 0 || earningsTomorrow.length > 0;

  return (
    <Collapsible
      className="rounded-md border border-line bg-elevated p-4"
      persistKey="morning-report"
      defaultOpen
      trigger={
        <div className="flex flex-1 items-baseline justify-between gap-3">
          <h2 className="tick text-title text-foreground">Morning Brief</h2>
          <span className="flex items-baseline gap-2 text-data text-muted">
            {data.weekday} {data.date}
            <Stale asOf={data.generated_at} variant="line" />
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
            <span className="text-data text-foreground">{data.day_ahead.gex_line}</span>
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
              className="flex items-baseline gap-2 text-body text-2 hover:text-accent"
            >
              <span className="w-12 shrink-0 text-data text-accent">${n.ticker}</span>
              <span className="min-w-0 flex-1">{n.headline}</span>
              {n.extra > 0 && (
                <span className="shrink-0 text-data text-muted">+{n.extra} more</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <div className="mb-0.5 eyebrow">Macro — today &amp; tomorrow</div>
          {near.length > 0 ? (
            <ul className="space-y-0.5 text-body text-2">
              {near.map((e, i) => (
                <li key={i}>
                  <span className={e.importance === "high" ? "text-warn" : "text-muted"}>•</span>{" "}
                  {eventLine(e, data.date)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted">nothing scheduled</p>
          )}
          <Link href="/calendar" className="mt-0.5 inline-block text-body text-muted hover:text-accent">
            {laterCount > 0 ? `+${laterCount} later this week · calendar ›` : "calendar ›"}
          </Link>
        </div>

        <div>
          <div className="mb-0.5 eyebrow">Earnings</div>
          {hasDayAheadEarnings ? (
            <ul className="space-y-0.5">
              {earningsToday.slice(0, 3).map((e, i) => (
                <EarningsRow key={`t${i}`} e={e} when="today" />
              ))}
              {earningsTomorrow.slice(0, 2).map((e, i) => (
                <EarningsRow key={`m${i}`} e={e} when="tmrw" />
              ))}
            </ul>
          ) : data.earnings.length > 0 ? (
            <ul className="space-y-0.5 text-data text-2">
              {data.earnings.slice(0, 4).map((e, i) => (
                <li key={i} className="flex items-baseline gap-1.5">
                  <span className="w-12 shrink-0 text-muted">{e.date.slice(5)}</span>
                  <span>{e.ticker ?? e.event}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted">none in the next 7 days</p>
          )}
        </div>
      </div>

      <Link
        href="/brief"
        className="mt-3 inline-block text-body text-muted hover:text-accent"
      >
        Full brief ›
      </Link>
    </Collapsible>
  );
}
