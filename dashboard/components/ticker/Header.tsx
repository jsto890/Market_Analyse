"use client";

import useSWR from "swr";
import * as Tooltip from "@radix-ui/react-tooltip";
import Badge from "@/components/ui/Badge";
import ConvictionDot from "@/components/ui/ConvictionDot";
import PinToggle from "@/components/ui/PinToggle";
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
    { refreshInterval: 10000, revalidateOnFocus: true, shouldRetryOnError: false }
  );
  // Shares SWR cache with CatalystsCard (same key) — no extra request.
  const { data: fundamentals } = useSWR<{ name?: string | null }>(
    `/api/argus/fundamentals/${ticker}`,
    fetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );
  const companyName = fundamentals?.name ?? null;

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
        {companyName && (
          <span className="max-w-[300px] truncate text-[14px] text-muted" title={companyName}>
            {companyName}
          </span>
        )}

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
          <PinToggle symbol={ticker} />
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
