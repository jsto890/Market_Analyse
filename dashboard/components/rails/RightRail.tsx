"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useNewsFeed, relTime, type NewsItem } from "@/lib/news";

const LS_KEY = "rail-right-collapsed";

export function RightRail() {
  // Start expanded SSR; sync from localStorage on mount to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable (private browsing, SSR guard)
    }
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

  // ── Minimised strip (36px) per spec §6.2 ─────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-9 flex-shrink-0 flex flex-col items-center py-1 border-l border-line bg-surface sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] font-mono">
        {/* Expand button — top, per spec §6.2 */}
        <button
          onClick={toggle}
          aria-label="Expand news rail"
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
        >
          <span className="text-[14px] leading-none select-none">‹</span>
        </button>
        {/* Rotated "NEWS" label per spec §6.2 */}
        <span
          className="text-[9px] font-mono font-medium uppercase tracking-[0.12em] text-muted mt-4"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          NEWS
        </span>
      </aside>
    );
  }

  // ── Expanded shell per spec §7.1 ──────────────────────────────────────────
  return (
    <aside className="w-[260px] flex-shrink-0 bg-surface border-l border-line font-mono sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-y-auto">
      {/* Header row per spec §7.1 — NEWS label + live item count */}
      <div className="h-[24px] flex items-center justify-between px-3 border-b border-line">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
          NEWS
        </span>
        <NewsFeedHeader />
      </div>

      {/* Live feed body */}
      <NewsFeedBody />

      {/* Collapse button per spec §8.5 — right rail: expanded shows › (push outward = collapse) */}
      <button
        onClick={toggle}
        aria-label="Collapse news rail"
        className="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated"
      >
        <span className="text-[14px] leading-none select-none">›</span>
      </button>
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
  whale: "🐋",
};

function shortSource(s: string): string {
  return SOURCE_SHORT[s.toLowerCase()] ?? s.slice(0, 4).toLowerCase();
}

// ── Header right-side: item count indicator ───────────────────────────────────
function NewsFeedHeader() {
  const { data, error } = useNewsFeed();
  if (error) return <span className="text-[9px] text-muted leading-none">offline</span>;
  if (!data) return <span className="text-[9px] text-muted opacity-40 leading-none">…</span>;
  return (
    <span className="text-[9px] text-muted leading-none">
      {data.items.length}
    </span>
  );
}

// ── Feed body ─────────────────────────────────────────────────────────────────
function NewsFeedBody() {
  const { data, error } = useNewsFeed();

  if (error) {
    return (
      <p className="text-[11px] text-muted px-3 pt-3 leading-relaxed">
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

  if (data.items.length === 0) {
    return (
      <p className="text-[11px] text-muted opacity-70 px-3 pt-3 leading-relaxed">
        no news yet — feed starts when the ingest service runs
      </p>
    );
  }

  const items = [...data.items].reverse();

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
  const isWhale = item.source === "whale";

  return (
    <div
      className={[
        "px-3 py-1.5 border-b border-line/50",
        isBreaking ? "border-l-2 border-neg pl-2" : "",
        isWhale && !isBreaking ? "border-l-2 border-teal pl-2" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Top meta line */}
      <div className="flex items-center gap-1.5 mb-0.5">
        {isBreaking && (
          <span className="text-[9px] font-medium text-neg mr-1 leading-none">
            BREAKING
          </span>
        )}
        <span className="text-[9px] text-muted leading-none">
          {relTime(item.ts)}
        </span>
        <span className="text-[9px] text-muted uppercase leading-none">
          {shortSource(item.source)}
        </span>
        {item.ticker && (
          <Link
            href={`/t/${item.ticker}`}
            className="text-[10px] text-accent leading-none ml-auto"
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
          className="text-[12px] text-foreground leading-snug line-clamp-3 block"
        >
          {item.headline}
        </a>
      ) : (
        <p className="text-[12px] text-foreground leading-snug line-clamp-3">
          {item.headline}
        </p>
      )}
    </div>
  );
}
