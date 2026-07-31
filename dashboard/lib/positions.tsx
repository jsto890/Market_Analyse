"use client";

import Link from "next/link";
import useSWR from "swr";

/** Only the two fields a cross-link needs; the portfolio page owns the full shape. */
interface Holding {
  symbol?: string;
  position?: number | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

/**
 * Open positions by symbol, size signed. Empty whenever the gateway is
 * unreachable — callers then render nothing, rather than a zero that would read
 * as "flat" instead of as "no answer".
 */
export function useHeldPositions(): Map<string, number> {
  const { data } = useSWR<Holding[] | { error: string }>("/api/argus/portfolio", fetcher, {
    refreshInterval: 60_000, shouldRetryOnError: false,
  });
  const rows = Array.isArray(data) ? data : [];
  return new Map(
    rows.filter((r) => r.symbol && (r.position ?? 0) !== 0).map((r) => [r.symbol!, r.position!])
  );
}

/**
 * The last step of the cross-links that start somewhere impersonal — an event on
 * the calendar, a sector on the RRG — and end at your own book. Names you do not
 * hold contribute nothing, so the line appears only when there is an answer.
 */
export function HeldChips({
  symbols,
  held,
  className,
}: {
  symbols: string[];
  held: Map<string, number>;
  className?: string;
}) {
  const yours = symbols.filter((s) => held.has(s));
  if (yours.length === 0) return null;
  // One name on the row means the chip beside this one already said which name
  // it is, so the size is the whole of what this adds. With several, the size
  // alone would not say which of them you own.
  const named = symbols.length > 1;
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-1.5 ${className ?? ""}`}>
      <span className="eyebrow">you hold</span>
      {yours.map((s) => {
        const size = `${held.get(s)! > 0 ? "+" : ""}${held.get(s)}`;
        return (
          <Link
            key={s}
            href="/portfolio"
            aria-label={`${s} ${size}`}
            className="rounded border border-line px-1.5 py-px font-mono text-micro text-accent hover:bg-elevated"
          >
            {named && `${s} `}
            <span className="text-muted">{size}</span>
          </Link>
        );
      })}
    </span>
  );
}
