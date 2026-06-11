"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

const GROUP_LABEL: Record<string, string> = {
  aligned: "aligned",
  pullback: "pullback",
  tech_fund: "tech+fund",
};

export interface DiffStripData {
  newTickers: string[];
  dropped: { ticker: string; group: string }[];
  groupMoves: { ticker: string; from: string; to: string }[];
  sentimentTurns: string[];
}

interface DiffStripProps {
  diff: DiffStripData;
}

function TickerLink({ ticker }: { ticker: string }) {
  return (
    <Link href={`/t/${ticker}`} className="font-mono text-accent hover:underline">
      {ticker}
    </Link>
  );
}

function Tickers({ list }: { list: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {list.map((t) => (
        <TickerLink key={t} ticker={t} />
      ))}
    </span>
  );
}

export default function DiffStrip({ diff }: DiffStripProps) {
  const storageKey = "dash:panel:diff";
  const [open, setOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) setOpen(stored === "true");
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(storageKey, String(next));
  }

  const hasNew = diff.newTickers.length > 0;
  const hasMoves = diff.groupMoves.length > 0;
  const hasTurns = diff.sentimentTurns.length > 0;
  const hasDropped = diff.dropped.length > 0;

  return (
    <section className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="font-medium text-[13px]">Changes since yesterday</span>
        <ChevronDown
          size={14}
          className="ml-auto shrink-0 text-muted transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200"
        style={{ maxHeight: hydrated ? (open ? "9999px" : "0px") : "9999px" }}
      >
        <div className="space-y-1 border-t border-line px-4 py-3 text-[13px]">
          {hasNew && (
            <div className="flex flex-wrap gap-2">
              <span className="text-muted">NEW:</span>
              <Tickers list={diff.newTickers} />
            </div>
          )}
          {hasMoves && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-muted">Moved:</span>
              {diff.groupMoves.map((m) => (
                <span key={m.ticker} className="inline-flex items-center gap-1">
                  <TickerLink ticker={m.ticker} />
                  <span className="text-muted">
                    {GROUP_LABEL[m.from] ?? m.from} → {GROUP_LABEL[m.to] ?? m.to}
                  </span>
                </span>
              ))}
            </div>
          )}
          {hasTurns && (
            <div className="flex flex-wrap gap-2">
              <span className="text-muted">Turned:</span>
              <span className="inline-flex flex-wrap gap-x-2">
                {diff.sentimentTurns.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1">
                    <TickerLink ticker={t} />
                    <span className="text-muted">↑sent</span>
                  </span>
                ))}
              </span>
            </div>
          )}
          {hasDropped && (
            <div className="flex flex-wrap gap-2">
              <span className="text-muted">Dropped:</span>
              <Tickers list={diff.dropped.map((d) => d.ticker)} />
              <span className="text-muted">
                (info only — downgrades are not sell signals)
              </span>
            </div>
          )}
          {!hasNew && !hasMoves && !hasTurns && !hasDropped && (
            <p className="text-muted">No changes since yesterday.</p>
          )}
        </div>
      </div>
    </section>
  );
}
