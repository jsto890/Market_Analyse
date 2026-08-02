"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNewsFeed, relTime, sortNewsByTs, type NewsItem } from "@/lib/news";
import { useWatchlistTickers } from "@/lib/watchlist";
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
const SOURCE_SHORT: Record<string, string> = {
  discord: "disc",
  "yahoo-finance": "yf",
  yf: "yf",
  ibkr: "ibkr",
  reuters: "reu",
  bloomberg: "bb",
  benzinga: "benz",
  twitter: "twit",
  x: "x",
  whale: "whl",
};

function shortSource(s: string): string {
  return SOURCE_SHORT[s.toLowerCase()] ?? s.slice(0, 4).toLowerCase();
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
      {groupByHour(items).map(([label, group]) => (
        <div key={label}>
          <div className="sticky top-[26px] z-[9] border-b border-line bg-elevated px-3 py-0.5">
            <span className="eyebrow leading-none">{label}</span>
          </div>
          {group.map((item: NewsItem) => (
            <NewsRow key={item.id} item={item} onWatchlist={!!item.ticker && watchlist.has(item.ticker)} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Buckets an already-sorted feed by clock hour, keeping order. The date is
 *  carried on the label only when the item is not from today — the common case
 *  is a feed that never leaves the current session. */
function groupByHour(items: NewsItem[]): [string, NewsItem[]][] {
  const now = new Date();
  const out: [string, NewsItem[]][] = [];
  for (const item of items) {
    const d = new Date(item.ts.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) {
      if (out.length === 0 || out[out.length - 1][0] !== "Undated") out.push(["Undated", []]);
      out[out.length - 1][1].push(item);
      continue;
    }
    const sameDay = d.toDateString() === now.toDateString();
    const hh = `${String(d.getHours()).padStart(2, "0")}:00`;
    const label = sameDay
      ? hh
      : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${hh}`;
    if (out.length === 0 || out[out.length - 1][0] !== label) out.push([label, []]);
    out[out.length - 1][1].push(item);
  }
  return out;
}

// ── Individual news row ───────────────────────────────────────────────────────
function NewsRow({ item, onWatchlist }: { item: NewsItem; onWatchlist: boolean }) {
  const isBreaking = Boolean(item.is_breaking);

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
      {/* Top meta line — when it broke, and who says so. */}
      <div className="mb-1 flex items-center gap-1.5">
        {isBreaking && (
          <span className="text-micro font-semibold leading-none text-neg">BREAKING</span>
        )}
        <span className="font-mono text-micro leading-none tracking-normal text-muted">
          {relTime(item.ts)} · {shortSource(item.source)}
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
        </div>
      )}
    </div>
  );
}
