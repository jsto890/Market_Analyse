export interface CalledSince {
  dateLabel: string; // "21 May"
  days: number;      // calendar days since the call
  pct: number | null;
}

export function calledSince(
  firstDate: string,
  entry: number | null,
  lastClose: number | null
): CalledSince | null {
  const d = new Date(`${firstDate.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  const dateLabel = d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const pct =
    entry != null && entry !== 0 && lastClose != null && isFinite(entry) && isFinite(lastClose)
      ? ((lastClose - entry) / entry) * 100
      : null;
  return { dateLabel, days, pct };
}
