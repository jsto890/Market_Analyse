"use client";

import { useEffect, useState } from "react";

export const TICKER_SECTIONS = [
  { id: "levels", label: "Levels" },
  { id: "why", label: "Why" },
  { id: "catalysts", label: "Catalysts" },
  { id: "news", label: "News" },
  { id: "sentiment", label: "Sentiment" },
  { id: "history", label: "History" },
  { id: "ai", label: "AI" },
] as const;

export default function TickerSubNav() {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveId((visible.target as HTMLElement).id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    for (const { id } of TICKER_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Ticker page sections"
      className="sticky top-[var(--nav-h)] z-20 flex gap-4 overflow-x-auto border-b border-line bg-surface px-4 py-2"
    >
      {TICKER_SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={activeId === s.id ? "true" : undefined}
          className={[
            "shrink-0 whitespace-nowrap border-b-2 pb-1 text-[12px] font-medium transition-colors",
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
