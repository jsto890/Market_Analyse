"use client";

import { useEffect, useState } from "react";

export interface StaleProps {
  /** When the data on screen was produced. `null` means "we don't know", which
   * is its own answer and is said out loud rather than left blank. */
  asOf: string | number | Date | null | undefined;
  /** Where it came from — `IBKR`, `yfinance`, `bridge`. Printed, not implied. */
  source?: string;
  /** Minutes after which the data is called stale. Default 15. */
  staleAfterMins?: number;
  /** Suppress the STALE chip — for surfaces that are expected to be old
   * (an EOD snapshot after the close). Provenance still prints. */
  expectStale?: boolean;
  /** `chip` for a control bar, `line` for a panel foot or page subtitle. */
  variant?: "chip" | "line";
  className?: string;
}

function toMillis(v: StaleProps["asOf"]): number | null {
  if (v === null || v === undefined) return null;
  const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function age(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * The one way this app says how old something is. Every surface here can be
 * old — the ladder, `/portfolio`, `/`, `/macro`, the rails — and staleness was
 * previously communicated five different ways.
 *
 * Renders on the client only: a server-rendered relative age is wrong the
 * moment it is sent, and mismatches on hydration.
 */
export default function Stale({
  asOf,
  source,
  staleAfterMins = 15,
  expectStale = false,
  variant = "chip",
  className = "",
}: StaleProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ms = toMillis(asOf);
  const isStale = ms !== null && now !== null && now - ms > staleAfterMins * 60_000 && !expectStale;

  const detail =
    ms === null ? (
      <span className="text-muted">no timestamp</span>
    ) : isStale && now !== null ? (
      // Once it is stale, how old it is is the whole story. The wall-clock time
      // it was produced is a third fact to read that changes nothing about what
      // you do next, and five days ago it is not even a time you recognise.
      <span className="text-muted">{age(ms, now)}</span>
    ) : (
      <>
        <span className="text-muted">as of </span>
        <span className="text-foreground">{clock(ms)}</span>
        {now !== null && <span className="text-muted"> · {age(ms, now)}</span>}
      </>
    );

  const body = (
    <>
      {isStale && (
        <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-px eyebrow text-warn">
          Stale
        </span>
      )}
      <span className="text-data">{detail}</span>
      {source && <span className="text-data text-muted">· {source}</span>}
    </>
  );

  return (
    <span
      // suppressHydrationWarning: the server has no clock for this.
      suppressHydrationWarning
      className={
        variant === "chip"
          ? `inline-flex items-center gap-1.5 rounded border border-line bg-elevated px-2 py-0.5 ${className}`
          : `inline-flex items-center gap-1.5 ${className}`
      }
    >
      {body}
    </span>
  );
}
