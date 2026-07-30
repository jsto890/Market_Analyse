"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTickerNav, type TickerNavState } from "@/lib/tickerNav";

export default function TickerNav({ ticker }: { ticker: string }) {
  const [nav, setNav] = useState<TickerNavState | null>(null);
  const upper = ticker.toUpperCase();

  useEffect(() => {
    setNav(getTickerNav());
  }, []);

  if (!nav || !nav.tickers.includes(upper)) {
    return (
      <Link
        href="/"
        className="inline-flex items-center gap-1 font-mono text-[12px] text-muted hover:text-foreground transition-colors"
      >
        <ChevronLeft size={12} /> Today
      </Link>
    );
  }

  const idx = nav.tickers.indexOf(upper);
  const prev = idx > 0 ? nav.tickers[idx - 1] : null;
  const next = idx < nav.tickers.length - 1 ? nav.tickers[idx + 1] : null;

  return (
    <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
      <Link href="/" className="hover:text-foreground transition-colors">
        Today
      </Link>
      <span className="text-line">/</span>
      <span>{nav.group}</span>
      <span className="text-line">|</span>
      {prev ? (
        <Link
          href={`/t/${prev}`}
          aria-label={`Previous: ${prev}`}
          className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          <ChevronLeft size={12} /> {prev}
        </Link>
      ) : (
        <span className="inline-flex items-center opacity-30">
          <ChevronLeft size={12} />
        </span>
      )}
      <span className="text-foreground">{upper}</span>
      {next ? (
        <Link
          href={`/t/${next}`}
          aria-label={`Next: ${next}`}
          className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          {next} <ChevronRight size={12} />
        </Link>
      ) : (
        <span className="inline-flex items-center opacity-30">
          <ChevronRight size={12} />
        </span>
      )}
    </div>
  );
}
