"use client";

import Link from "next/link";
import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import { useCalendar, isEarnings, type CalEvent } from "@/lib/calendar";
import { eventMeta, eventShortName } from "@/lib/eventMeta";
import { useMacroContributors } from "@/lib/macro";

/** Only the two fields the band needs; the portfolio page owns the full shape. */
interface Holding {
  symbol?: string;
  position?: number | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

/** Calendar days from `today` (the calendar's own date) to an event date. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
}

/** "Today" · "Tomorrow" · "in 6d · 6 Aug" — the idiom the ticker header uses. */
function whenLabel(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  const when = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
  return `in ${days}d · ${when}`;
}

/**
 * The next scheduled event this scope has to get through.
 *
 * GLOBAL and US are the macro tape, so their catalyst is the next release — an
 * earnings date for one name says nothing about either. A sector's catalyst is
 * whichever comes first: a print `eventMeta` maps onto that family, or a report
 * from one of the names currently driving the score.
 */
export function nextCatalyst(
  scope: string, events: CalEvent[], tickers: string[]
): CalEvent | null {
  const sector = scope.startsWith("sector:") ? scope.slice(7) : null;
  const driving = new Set(tickers);
  const ordered = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time_et ?? "").localeCompare(b.time_et ?? "")
  );
  for (const ev of ordered) {
    if (!sector) {
      if (!isEarnings(ev)) return ev;
      continue;
    }
    if (ev.ticker) {
      if (driving.has(ev.ticker)) return ev;
      continue;
    }
    // eventMeta's sector lists are written in sector_taxonomy naming, which is
    // the same vocabulary the macro scopes use.
    const meta = eventMeta(ev.event, ev.category, ev.ticker);
    if (meta?.sectors.includes(sector)) return ev;
  }
  return null;
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-line px-3 py-2 first:border-t-0">
      <p className="eyebrow">{title}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ ticker, suffix }: { ticker: string; suffix?: string }) {
  return (
    <Link
      href={`/t/${ticker}`}
      className="rounded border border-line px-1.5 py-px text-data text-accent hover:bg-elevated"
    >
      {ticker}
      {suffix && <span className="text-muted"> {suffix}</span>}
    </Link>
  );
}

/**
 * What the selected scope means for you: the names carrying it, which of them
 * you actually hold, and the next dated event it runs into. Each cell needs its
 * own feed — a scope with no holdings, or a portfolio the gateway can't reach,
 * renders no exposure cell rather than an empty one.
 */
export default function ScopeBand({ scope, window }: { scope: string; window: string }) {
  const { data } = useMacroContributors(scope, window);
  const { data: cal } = useCalendar(21);
  const { data: portfolio } = useSWR<Holding[] | { error: string }>(
    "/api/argus/portfolio", fetcher, { shouldRetryOnError: false }
  );

  const driving = data?.tickers ?? [];
  const symbols = driving.map((t) => t.ticker);

  const held = Array.isArray(portfolio)
    ? portfolio.filter((p) => p.symbol && (p.position ?? 0) !== 0 && symbols.includes(p.symbol))
    : [];

  const catalyst = cal?.events ? nextCatalyst(scope, cal.events, symbols) : null;

  if (driving.length === 0 && held.length === 0 && !catalyst) return null;

  return (
    <Panel title="Where this lands">
      {driving.length > 0 && (
        <Cell title="names driving this scope">
          {driving.map((t) => (
            <Chip key={t.ticker} ticker={t.ticker} suffix={`×${t.n}`} />
          ))}
        </Cell>
      )}
      {held.length > 0 && (
        <Cell title="your exposure">
          {held.map((p) => (
            <Chip
              key={p.symbol}
              ticker={p.symbol!}
              suffix={`${(p.position ?? 0) > 0 ? "+" : ""}${p.position}`}
            />
          ))}
        </Cell>
      )}
      {catalyst && cal && (
        <Cell title="next catalyst">
          <Link href="/calendar" className="text-body text-foreground hover:text-accent">
            {eventShortName(catalyst.event, catalyst.category, catalyst.ticker)}
          </Link>
          <span className="text-data text-muted">{whenLabel(catalyst.date, cal.today)}</span>
        </Cell>
      )}
    </Panel>
  );
}
