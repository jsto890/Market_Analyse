import type { BridgeRow } from "@/types/bridge";

export function splitAccounts(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface AccountAgg {
  handle: string;
  tickerCount: number;
  tickers: string[];
}

/**
 * Cross-ticker rollup of BridgeRow.top_accounts. This is breadth-today
 * (how many tickers an account was attached to), not a track record —
 * no win-rate/follow-quality signal exists in this dataset (TK-01).
 */
export function aggregateAccounts(rows: BridgeRow[]): AccountAgg[] {
  const byHandle = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const handle of splitAccounts(row.top_accounts)) {
      if (!byHandle.has(handle)) byHandle.set(handle, new Set());
      byHandle.get(handle)!.add(row.ticker.toUpperCase());
    }
  }
  return Array.from(byHandle.entries())
    .map(([handle, tickers]) => ({
      handle,
      tickerCount: tickers.size,
      tickers: Array.from(tickers).sort(),
    }))
    .sort((a, b) => b.tickerCount - a.tickerCount || a.handle.localeCompare(b.handle));
}
