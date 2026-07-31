"use client";

import { useEffect, useState } from "react";

/**
 * Section index for the ticker page. Labels are deliberately *not* a 1:1 echo of
 * the panel headings 40px below — they name the grouped destination (TN-01), and
 * the left column (chart, options, gamma) is included, which is 62% of the page
 * and used to be unreachable from here (TN-02).
 */
export const TICKER_SECTIONS = [
  { id: "chart", label: "Price" },
  { id: "options", label: "Options" },
  { id: "gamma", label: "Gamma" },
  { id: "levels", label: "Trade plan" },
  { id: "why", label: "Rationale" },
  { id: "catalysts", label: "Catalysts" },
  { id: "news", label: "News & tone" },
  { id: "history", label: "Track record" },
  { id: "ai", label: "AI" },
] as const;

/** The gamma card only renders for the index ETFs — don't advertise a dead anchor. */
export function tickerSections(hasGamma: boolean) {
  return TICKER_SECTIONS.filter((s) => s.id !== "gamma" || hasGamma);
}

export default function TickerSubNav({ hasGamma = false }: { hasGamma?: boolean }) {
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

  return (
    <nav
      aria-label="Ticker page sections"
      // One slim bar, not a second full-height chrome layer under the app nav (TN-06).
      className="sticky top-[var(--nav-h)] z-20 -mx-4 flex gap-3 overflow-x-auto border-b border-line bg-surface/95 px-4 py-1 backdrop-blur"
    >
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          // "location" is the value for the current section of a page; "true" is
          // for the current page in a set of pages (TN-05).
          aria-current={activeId === s.id ? "location" : undefined}
          className={[
            "shrink-0 whitespace-nowrap border-b-2 pb-0.5 text-micro uppercase tracking-wide transition-colors",
            activeId === s.id
              ? "border-accent text-foreground"
              : "border-transparent text-muted hover:text-foreground",
          ].join(" ")}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
