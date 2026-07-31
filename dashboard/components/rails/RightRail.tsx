"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNewsFeed, relTime, sortNewsByTs, type NewsItem } from "@/lib/news";
import { useWatchlistTickers } from "@/lib/watchlist";

const LS_KEY = "rail-right-collapsed";

const NARROW_QUERY = "(max-width: 1279px)";

export function RightRail() {
  // Start expanded SSR; reconcile from localStorage/viewport on mount to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const scrollRef = useRef<HTMLElement | null>(null);
  const [lastSeenId, setLastSeenId] = useState<number | null>(null);
  const [atTop, setAtTop] = useState(true);
  const { data } = useNewsFeed();

  useEffect(() => {
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
    // Default closed at every width: the feed is ambient, and 260px of
    // permanent chrome is the single largest tax on the content column.
    else setCollapsed(true);

    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      // Explicit stored preference always wins over the media query.
      if (readStored() !== null) return;
      setCollapsed(e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

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
      <aside className="order-3 w-9 flex-shrink-0 flex flex-col items-center py-1 border-l border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] font-mono">
        {/* Expand button — top, per spec §6.2 */}
        <button
          onClick={toggle}
          aria-label="Expand news rail"
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-body leading-none select-none">‹</span>
        </button>
        {/* Rotated "NEWS" label per spec §6.2 */}
        <span
          className="text-micro font-mono font-medium uppercase tracking-[0.12em] text-muted mt-4"
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
      className="order-3 w-[260px] flex-shrink-0 bg-surface border-l border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto"
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
        <span className="mr-auto text-micro font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
          News
        </span>
        <NewsFeedHeader />
      </div>

      {/* All / My tickers filter chips (RR-03) */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-line">
        {(["all", "mine"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`px-1.5 py-px font-mono font-medium leading-none ${
              filter === f ? "bg-accent/15 text-accent" : "bg-elevated text-muted hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : "My tickers"}
          </button>
        ))}
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
      <NewsFeedBody filter={filter} />
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
  if (error) return <span className="text-micro text-warn leading-none">offline</span>;
  if (!data) return <span className="text-micro text-muted opacity-40 leading-none">…</span>;
  return (
    <span className="text-micro text-muted leading-none">
      {data.items.length}
    </span>
  );
}

// ── Feed body ─────────────────────────────────────────────────────────────────
function NewsFeedBody({ filter }: { filter: "all" | "mine" }) {
  const { data, error } = useNewsFeed();
  const watchlist = useWatchlistTickers();

  if (error) {
    return (
      <p className="flex items-center gap-1.5 text-micro text-warn px-3 pt-3 leading-relaxed">
        <AlertTriangle size={12} strokeWidth={2} className="flex-shrink-0" />
        news feed offline
      </p>
    );
  }

  if (!data) {
    // Loading skeleton
    return (
      <div className="px-3 pt-4 flex flex-col gap-3">
        <div className="h-3 bg-elevated rounded animate-pulse" style={{ width: "70%" }} />
        <div className="h-3 bg-elevated rounded animate-pulse" style={{ width: "55%" }} />
        <div className="h-3 bg-elevated rounded animate-pulse" style={{ width: "80%" }} />
      </div>
    );
  }

  const sorted = sortNewsByTs(data.items);
  const items = filter === "mine"
    ? sorted.filter((i) => i.ticker && watchlist.has(i.ticker))
    : sorted;

  if (items.length === 0) {
    return (
      <p className="text-micro text-muted opacity-70 px-3 pt-3 leading-relaxed">
        {filter === "mine"
          ? "no news for your watchlist tickers yet"
          : "no news yet — feed starts when the ingest service runs"}
      </p>
    );
  }

  return (
    <div>
      {items.map((item: NewsItem) => (
        <NewsRow key={item.id} item={item} />
      ))}
    </div>
  );
}

// ── Individual news row ───────────────────────────────────────────────────────
function NewsRow({ item }: { item: NewsItem }) {
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
      {/* Top meta line */}
      <div className="flex items-center gap-1.5 mb-0.5">
        {isBreaking && (
          <span className="text-micro font-medium text-neg mr-1 leading-none">
            BREAKING
          </span>
        )}
        <span className="text-micro text-muted leading-none">
          {relTime(item.ts)}
        </span>
        <span className="text-micro text-muted uppercase leading-none">
          {shortSource(item.source)}
        </span>
        {item.ticker && (
          <Link
            href={`/t/${item.ticker}`}
            className="text-micro text-accent leading-none ml-auto -my-1.5 py-1.5 px-1"
          >
            {item.ticker}
          </Link>
        )}
      </div>

      {/* Headline */}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title={item.headline}
          className="text-dense text-foreground leading-snug line-clamp-3 block"
        >
          {item.headline}
        </a>
      ) : (
        <p title={item.headline} className="text-dense text-foreground leading-snug line-clamp-3">
          {item.headline}
        </p>
      )}
    </div>
  );
}
