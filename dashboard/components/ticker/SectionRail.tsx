"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Brain,
  CandlestickChart,
  History,
  Layers,
  MessageSquare,
  Newspaper,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Section index for the ticker page. This replaced a horizontal label strip
 * whose words were printed again 40px below as `Panel title` — "Options" and
 * "AI" matched their panel headings exactly. Here the words appear one at a
 * time — the section you're in, plus whichever you point at — so the index can
 * never restate the headings it points at, and a single column addresses the
 * whole page without a scrolling bar.
 *
 * The order below is the page's document order, and has to stay that way: the
 * chart column, then the two panels beside it, then the full-width band below
 * the fold. The page uses no `order` overrides for exactly this reason, so
 * reading order, tab order and this index are the same sequence (TN-03).
 */
export const TICKER_SECTIONS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "chart", label: "Price", Icon: CandlestickChart },
  { id: "options", label: "Options", Icon: Layers },
  { id: "gamma", label: "Gamma", Icon: Activity },
  // No "Trade plan" entry: entry, stop and target are drawn on the chart, so
  // the levels card — and its `#levels` anchor — are gone. "Price" already
  // points at them.
  { id: "why", label: "Rationale", Icon: Brain },
  { id: "catalysts", label: "Catalysts", Icon: Zap },
  // From here down the sections sit in the full-width band below the fold.
  { id: "news", label: "News", Icon: Newspaper },
  { id: "sentiment", label: "Sentiment", Icon: MessageSquare },
  { id: "history", label: "Track record", Icon: History },
  { id: "ai", label: "AI", Icon: Sparkles },
];

/** The gamma card only renders for the index ETFs — don't advertise a dead anchor. */
export function tickerSections(hasGamma: boolean) {
  return TICKER_SECTIONS.filter((s) => s.id !== "gamma" || hasGamma);
}

export default function SectionRail({ hasGamma = false }: { hasGamma?: boolean }) {
  const sections = tickerSections(hasGamma);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Callback order is arbitrary — the active section is the *topmost*
        // intersecting one, so sort by viewport position (TN-04).
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId((visible.target as HTMLElement).id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    for (const { id } of TICKER_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [hasGamma]);

  // At the top of the page nothing has crossed the observer's band yet, and an
  // unlabelled rail is a row of unexplained glyphs. You are in the first
  // section, so say so.
  const currentId = activeId ?? sections[0]?.id ?? null;

  return (
    <nav
      aria-label="Ticker page sections"
      // Wide enough for the longest label so the content column doesn't shift
      // as you scroll through the sections.
      className="sticky top-[calc(var(--nav-h)+12px)] hidden w-32 shrink-0 flex-col gap-0.5 self-start rounded-md border border-line bg-surface p-1 min-[900px]:flex"
    >
      {sections.map(({ id, label, Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          aria-label={label}
          // "location" is the value for the current section of a page; "true" is
          // for the current page in a set of pages (TN-05).
          aria-current={currentId === id ? "location" : undefined}
          className={[
            "group flex h-7 items-center gap-1.5 rounded px-1.5 transition-colors",
            currentId === id
              ? "bg-raised text-accent"
              : "text-muted hover:bg-raised hover:text-foreground",
          ].join(" ")}
        >
          <Icon size={14} className="shrink-0" aria-hidden="true" />
          {/* One word at a time: the section you're in, plus whichever you point
              at. Ten labels at once would restate the panel titles below. */}
          <span
            className={
              currentId === id
                ? "truncate text-label font-medium"
                : "hidden truncate text-label font-medium group-hover:inline group-focus-visible:inline"
            }
          >
            {label}
          </span>
        </a>
      ))}
    </nav>
  );
}
