export type ChartPeriod = "3M" | "6M" | "1Y" | "2Y";

const MONTHS: Record<ChartPeriod, number> = { "3M": 3, "6M": 6, "1Y": 12, "2Y": 24 };

/** Visible window for a period, in epoch seconds, clamped to available history. */
export function visibleRangeFor(
  period: ChartPeriod,
  firstTs: number,
  lastTs: number
): { from: number; to: number } {
  const d = new Date(lastTs * 1000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - MONTHS[period]);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return { from: Math.max(firstTs, Math.floor(d.getTime() / 1000)), to: lastTs };
}
