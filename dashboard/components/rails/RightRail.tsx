"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNewsFeed, relTime, sortNewsByTs, type NewsItem } from "@/lib/news";
import { useCalendar, isEarnings } from "@/lib/calendar";
import { useWatchlistTickers } from "@/lib/watchlist";
import InfoTip from "@/components/ui/InfoTip";
import Loading from "@/components/ui/Loading";
import Empty from "@/components/ui/Empty";
import Failed from "@/components/ui/Failed";

const LS_KEY = "rail-right-collapsed";

const NARROW_QUERY = "(max-width: 1279px)";

export function RightRail({ dense = false }: { dense?: boolean }) {
  // Start expanded SSR; reconcile from localStorage/viewport on mount to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [lastSeenId, setLastSeenId] = useState<number | null>(null);
  const [atTop, setAtTop] = useState(true);
  const { data } = useNewsFeed();

  useEffect(() => {
    // News is Today's third band, and Today's alone. Everywhere else it is a
    // firehose beside a page you came to read — a strip, not a column.
    if (dense) {
      setCollapsed(true);
      return;
    }

    const readStored = (): string | null => {
      try {
        return window.localStorage.getItem(LS_KEY);
      } catch {
        return null;
      }
    };

    const stored = readStored();
    if (stored === "1") setCollapsed(true);
    else if (stored === "0") setCollapsed(false);
    else setCollapsed(window.innerWidth < 1280);

    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      // Explicit stored preference always wins over the media query.
      if (readStored() !== null) return;
      setCollapsed(e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [dense]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Track newest seen id while scrolled to top; freezes while the user has scrolled away.
  useEffect(() => {
    if (!data || !atTop) return;
    const max = data.items.reduce((m, i) => Math.max(m, i.id), 0);
    setLastSeenId((prev) => (prev === null || max > prev ? max : prev));
  }, [data, atTop]);

  const newCount = data && lastSeenId !== null
    ? data.items.filter((i) => i.id > lastSeenId).length
    : 0;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop < 4);
  };

  const scrollToTop = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setAtTop(true);
  };

  // ── Minimised strip (36px) per spec §6.2 ─────────────────────────────────
  if (collapsed) {
    return (
      <aside className="order-3 w-[var(--rail-collapsed)] flex-shrink-0 flex flex-col items-center py-1 border-l border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] font-mono">
        {/* Expand button — top, per spec §6.2 */}
        <button
          onClick={toggle}
          aria-label="Expand news rail"
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-body leading-none select-none">‹</span>
        </button>
        {/* Rotated label per spec §6.2 */}
        <span
          className="eyebrow tracking-[0.12em] mt-4"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          NEWS
        </span>
      </aside>
    );
  }

  // ── Expanded shell per spec §7.1 ──────────────────────────────────────────
  return (
    <aside
      ref={scrollRef}
      onScroll={handleScroll}
      className="order-3 w-[var(--rail-r)] flex-shrink-0 bg-surface border-l border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto"
    >
      {/* Header row — collapse control lives here, not at the bottom of a
       * scrolling column where a long feed pushes it out of reach. */}
      <div className="sticky top-0 z-10 flex h-[26px] items-center justify-between gap-2 border-b border-line bg-surface px-2">
        <button
          onClick={toggle}
          aria-label="Collapse news rail"
          className="-ml-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm text-muted hover:bg-elevated hover:text-foreground"
        >
          <span className="text-body leading-none select-none">›</span>
        </button>
        <span className="mr-auto eyebrow leading-none">News</span>
        <NewsFeedHeader />
      </div>

      {/* "N new" pill — shows once scrolled away from top when newer items arrive */}
      {newCount > 0 && !atTop && (
        <button
          onClick={scrollToTop}
          className="w-full text-center py-1 font-mono font-medium text-accent bg-accent/10 hover:bg-accent/15 border-b border-line"
        >
          {newCount} new ↑
        </button>
      )}

      {/* Live feed body */}
      <NewsFeedBody />
    </aside>
  );
}

// ── Source label map ──────────────────────────────────────────────────────────
// The four-letter codes were cut for a 260px rail; the rail is 288px and the
// names fit, so the reader no longer has to decode "reu" or "benz".
const SOURCE_NAME: Record<string, string> = {
  discord: "Discord",
  "yahoo-finance": "Yahoo Finance",
  yf: "Yahoo Finance",
  ibkr: "IBKR",
  reuters: "Reuters",
  bloomberg: "Bloomberg",
  benzinga: "Benzinga",
  twitter: "X",
  x: "X",
  whale: "Whale",
};

function sourceName(s: string): string {
  const key = s.toLowerCase();
  return SOURCE_NAME[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

// ── Clock ─────────────────────────────────────────────────────────────────────
// Headlines are stamped in UTC by the ingest, and read against the session the
// market keeps. Both the row and the hour header run on ET so a row always sits
// under the hour it belongs to.
const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23",
});

function parseTs(ts: string): Date | null {
  const d = new Date(ts.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "09:31" in ET, or "" when the stamp does not parse. */
function etTime(ts: string): string {
  const d = parseTs(ts);
  return d ? ET_CLOCK.format(d) : "";
}

function etParts(d: Date): { day: string; key: string; hour: number } {
  const p: Record<string, string> = {};
  for (const part of ET_PARTS.formatToParts(d)) p[part.type] = part.value;
  return { day: `${p.month} ${p.day}`, key: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "3m ago" — the age, which is a deferral, not something to print sixty times. */
function ageLabel(ts: string): string {
  const rel = relTime(ts);
  if (!rel) return "";
  return rel === "now" ? "just now" : `${rel} ago`;
}

// ── Header right-side: item count indicator ───────────────────────────────────
function NewsFeedHeader() {
  const { data, error } = useNewsFeed();
  // One slot, one size: the count is data, and the two states that stand in for
  // it are the word beside the figure that isn't there yet.
  if (error) return <span className="text-label text-warn leading-none">offline</span>;
  if (!data) return <span className="text-data text-muted opacity-40 leading-none">…</span>;
  return (
    <span className="text-data text-muted leading-none">
      {data.items.length}
    </span>
  );
}

// ── Feed body ─────────────────────────────────────────────────────────────────
function NewsFeedBody() {
  const { data, error } = useNewsFeed();
  const watchlist = useWatchlistTickers();
  const reportingToday = useReportingToday();

  if (error) {
    return (
      <Failed
        title="News feed offline"
        message="The ingest service isn’t responding."
        className="m-3"
      />
    );
  }

  if (!data) {
    return <Loading variant="lines" count={3} label="Loading news" className="px-3 pt-4" />;
  }

  const items = sortNewsByTs(data.items);

  if (items.length === 0) {
    return (
      <Empty message="No headlines yet — the feed starts when the ingest service runs." />
    );
  }

  // An undifferentiated column of 60 rows reads as one blur; the hour is the
  // unit a trader recalls in ("what came out after the open"). Rows stay in
  // time order — the headers only say where each hour starts.
  return (
    <div>
      {groupByHour(items).map(([label, group], i) => (
        <div key={`${label}-${i}`}>
          <div className="sticky top-[26px] z-[9] border-b border-line bg-elevated px-3 py-0.5">
            <span className="eyebrow leading-none">{label}</span>
          </div>
          {group.map((item: NewsItem) => (
            <NewsRow
              key={item.id}
              item={item}
              onWatchlist={!!item.ticker && watchlist.has(item.ticker)}
              reporting={!!item.ticker && reportingToday.has(item.ticker)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Buckets an already-sorted feed by ET clock hour, keeping order. Each header
 *  states the span it covers rather than just where it starts, so a row is
 *  placed between two times instead of after one; the hour still running is
 *  named for what it is. The date is carried only when the bucket is not
 *  today's — the common case is a feed that never leaves the current session. */
function groupByHour(items: NewsItem[]): [string, NewsItem[]][] {
  const now = new Date();
  const nowEt = etParts(now);
  const buckets: { at: Date | null; items: NewsItem[] }[] = [];
  let lastKey = "";

  for (const item of items) {
    const d = parseTs(item.ts);
    const p = d ? etParts(d) : null;
    const key = p ? `${p.key}|${p.hour}` : "undated";
    if (key !== lastKey) {
      buckets.push({ at: d, items: [] });
      lastKey = key;
    }
    buckets[buckets.length - 1].items.push(item);
  }

  return buckets.map(({ at, items: group }, i) => {
    if (!at) return ["Undated", group] as [string, NewsItem[]];
    const { day, key, hour } = etParts(at);
    // Only the newest bucket can still be filling, and only if the clock has
    // not left it — an 09:00 header at 14:00 must not claim to be current.
    const live = i === 0 && key === nowEt.key && hour === nowEt.hour;
    const span = `${pad2(hour)}:00 — ${live ? "now" : `${pad2((hour + 1) % 24)}:00`}`;
    return [key === nowEt.key ? span : `${day} · ${span}`, group] as [string, NewsItem[]];
  });
}

/** Names with an earnings date of today, from the calendar the rail already
 *  loads. A headline about a company reporting tonight is a different object
 *  from a headline about one that isn't. */
function useReportingToday(): Set<string> {
  const { data } = useCalendar(7);
  const out = new Set<string>();
  if (!data?.today) return out;
  for (const ev of data.events) {
    if (ev.date === data.today && ev.ticker && isEarnings(ev)) out.add(ev.ticker);
  }
  return out;
}

// ── Individual news row ───────────────────────────────────────────────────────
function NewsRow(
  { item, onWatchlist, reporting }: { item: NewsItem; onWatchlist: boolean; reporting: boolean },
) {
  const isBreaking = Boolean(item.is_breaking);
  const at = etTime(item.ts);
  const age = ageLabel(item.ts);

  // No per-source accent stripe: the feed is predominantly whale prints, so a
  // teal border on every row carried no signal. Source is already stated in
  // the meta line. Only BREAKING — genuinely exceptional — gets an edge mark.
  return (
    <div
      className={[
        "px-3 py-1.5 border-b border-line/50",
        isBreaking ? "border-l-2 border-neg pl-2" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Top meta line — when it broke, and who says so. The clock is what a
          trader reconciles against ("that was before the print"); the age is
          one subtraction away and sits in the tooltip, where the hour header
          has not already answered it. */}
      <div className="mb-1 flex items-center gap-1.5">
        {isBreaking && (
          <span className="text-micro font-semibold leading-none text-neg">BREAKING</span>
        )}
        <span className="flex items-center gap-1 font-mono text-micro leading-none tracking-normal text-muted">
          {at && (
            age
              ? <InfoTip content={age} className="leading-none tracking-normal">{at}</InfoTip>
              : <span>{at}</span>
          )}
          <span>{at ? "· " : ""}{sourceName(item.source)}</span>
        </span>
      </div>

      {/* The headline is prose, so it is set in the reading face — the rail's
          mono is for times, tickers and figures. */}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="block font-sans text-label leading-relaxed text-foreground"
        >
          {item.headline}
        </a>
      ) : (
        <p className="font-sans text-label leading-relaxed text-foreground">{item.headline}</p>
      )}

      {item.ticker && (
        /* A name you hold reads differently from a name you don't. The chip is
           the only thing that separates the two in a 60-row feed. */
        <div className="mt-1.5 flex gap-1">
          <Link
            href={`/t/${item.ticker}`}
            aria-label={onWatchlist ? `${item.ticker} — on your watchlist` : item.ticker}
            className={`rounded-sm border px-1.5 py-1 text-micro leading-none ${
              onWatchlist
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-line text-accent"
            }`}
          >
            {item.ticker}
          </Link>
          {onWatchlist && (
            <span className="rounded-sm border border-model/40 px-1.5 py-1 text-micro leading-none text-model">
              pinned
            </span>
          )}
          {reporting && (
            <span className="rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-1 text-micro leading-none text-warn">
              earnings
            </span>
          )}
        </div>
      )}
    </div>
  );
}
