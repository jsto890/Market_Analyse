"use client";

import { useRef } from "react";
import useSWR from "swr";
import * as Tooltip from "@radix-ui/react-tooltip";
import Badge from "@/components/ui/Badge";
import ConvictionDot from "@/components/ui/ConvictionDot";
import type { BridgeRow, Conviction } from "@/types/bridge";
import { calledSince } from "@/lib/called-since";

interface SignalRow {
  date: string;
  report_group: string | null;
  action_label: string | null;
  combined_score: number | null;
  entry: number | null;
}

interface HeaderProps {
  ticker: string;
  bridgeRow: BridgeRow | null;
  signalHistory: SignalRow[];
  lastClose: number | null; // from server-fetched history bars
  medianPeakPct?: number;
  medianDaysToPeak?: number;
}

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="text-muted text-[11px] font-mono leading-none cursor-default select-none"
          aria-label="info"
        >
          i
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[240px]"
          sideOffset={4}
        >
          {text}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function PinButton({ ticker }: { ticker: string }) {
  const { data, mutate } = useSWR<{ watchlist: { ticker: string }[] }>(
    "/api/watchlist",
    fetcher,
    { revalidateOnFocus: false }
  );
  const pending = useRef(false);

  const pinned = data?.watchlist?.some((w) => w.ticker === ticker) ?? false;

  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    const optimistic = !pinned;
    // Optimistic update
    mutate(
      (prev) => {
        if (!prev) return prev;
        const wl = optimistic
          ? [...prev.watchlist, { ticker }]
          : prev.watchlist.filter((w) => w.ticker !== ticker);
        return { watchlist: wl };
      },
      false
    );
    try {
      await fetch("/api/watchlist", {
        method: optimistic ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
    } catch {
      // revert on error
      mutate();
    } finally {
      pending.current = false;
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={[
        "px-2 py-0.5 rounded border text-[11px] font-mono transition-colors",
        pinned
          ? "border-accent text-accent bg-accent/10"
          : "border-line text-muted hover:border-accent hover:text-accent",
      ].join(" ")}
    >
      {pinned ? "Pinned" : "Pin"}
    </button>
  );
}

export default function Header({
  ticker,
  bridgeRow,
  signalHistory,
  lastClose,
  medianPeakPct = 23,
  medianDaysToPeak = 7,
}: HeaderProps) {
  const { data: quote } = useSWR<QuoteData>(
    `/api/argus/quote/${ticker}`,
    fetcher,
    { refreshInterval: 30000, shouldRetryOnError: false }
  );

  const price = quote?.price ?? null;
  const changePct = quote?.change_pct ?? null;

  const posNeg =
    changePct === null
      ? "text-muted"
      : changePct >= 0
      ? "text-pos"
      : "text-neg";

  // Flag-age line: first SQLite row
  const firstRow = signalHistory.length > 0 ? signalHistory[0] : null;
  let flagAgeLine: React.ReactNode = null;
  if (firstRow) {
    const cs = calledSince(firstRow.date, firstRow.entry, lastClose);
    if (cs) {
      flagAgeLine = (
        <p className="text-[12px] text-muted font-mono tabular-nums mt-1">
          called {cs.dateLabel}
          {firstRow.entry !== null ? ` @ ${firstRow.entry.toFixed(2)}` : ""}
          {cs.pct !== null && lastClose !== null ? (
            <>
              {" → "}
              {lastClose.toFixed(2)}{" "}
              <span className={cs.pct >= 0 ? "text-pos" : "text-neg"}>
                ({cs.pct >= 0 ? "+" : ""}
                {cs.pct.toFixed(1)}%, {cs.days}d)
              </span>
            </>
          ) : null}
          {" · "}
          <span className="text-muted">
            median pick peaks +{medianPeakPct}% @ ~{medianDaysToPeak}d
          </span>
        </p>
      );
    }
  }

  // Earnings chip
  const earningsInDays = bridgeRow?.earnings_in_days ?? null;
  let earningsNode: React.ReactNode = null;
  if (earningsInDays !== null) {
    if (earningsInDays <= 10) {
      earningsNode = (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px text-[11px] font-mono text-warn tabular-nums cursor-default">
              earnings in {earningsInDays}d
            </span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
              sideOffset={4}
            >
              earnings in {earningsInDays}d — inside typical hold window
              <Tooltip.Arrow className="fill-elevated" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      );
    } else {
      earningsNode = (
        <span className="text-[12px] text-muted font-mono tabular-nums">
          earnings in {earningsInDays}d
        </span>
      );
    }
  }

  return (
    <div className="px-4 py-4 space-y-1">
      {/* Row 1: ticker + price + badges */}
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[28px] font-mono font-semibold leading-none text-foreground tabular-nums">
          {ticker}
        </span>

        <div className="flex items-baseline gap-2">
          {price !== null ? (
            <span className="font-mono text-[18px] tabular-nums text-foreground">
              {price.toFixed(2)}
            </span>
          ) : (
            <span className="font-mono text-[18px] tabular-nums text-muted">—</span>
          )}
          {changePct !== null && (
            <span className={`font-mono text-[14px] tabular-nums ${posNeg}`}>
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%
            </span>
          )}
        </div>

        {bridgeRow && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="tier" value={bridgeRow.action_label} />
            <Badge variant="verdict" value={bridgeRow.argus_verdict} />
            <Badge variant="style" value={bridgeRow.trade_style} />
            <ConvictionDot value={bridgeRow.conviction as Conviction} />
            {bridgeRow.high_conviction && (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span className="inline-flex items-center rounded border border-accent/50 bg-accent/10 px-1.5 py-px text-[11px] font-mono text-accent cursor-default">
                    HC
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[220px]"
                    sideOffset={4}
                  >
                    {"≥"}75% indicator agreement — consensus, not edge
                    <Tooltip.Arrow className="fill-elevated" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <PinButton ticker={ticker} />
        </div>
      </div>

      {/* Row 2: flag-age line */}
      {flagAgeLine}

      {/* Row 3: earnings */}
      {earningsNode && (
        <div className="flex items-center gap-2 mt-1">{earningsNode}</div>
      )}
    </div>
  );
}
