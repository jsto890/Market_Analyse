import type { Bar } from "@/components/charts/CandleChart";

export function volumeVsAvg(bars: Bar[], lookback = 20): number | null {
  if (bars.length < lookback + 2) return null;
  const last = bars[bars.length - 1].volume;
  const prior = bars.slice(-(lookback + 1), -1);
  const avg = prior.reduce((a, b) => a + b.volume, 0) / lookback;
  return avg > 0 ? last / avg : null;
}

export function range52w(bars: Bar[]): { lo: number; hi: number; pos: number } | null {
  const win = bars.slice(-252);
  if (win.length < 60) return null;
  const lo = Math.min(...win.map((b) => b.low));
  const hi = Math.max(...win.map((b) => b.high));
  if (!(hi > lo)) return null;
  const close = win[win.length - 1].close;
  return { lo, hi, pos: (close - lo) / (hi - lo) };
}
