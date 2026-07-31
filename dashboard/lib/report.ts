"use client";

import useSWR from "swr";

export interface MorningEvent {
  date: string; time_et: string | null; event: string;
  category: string; importance: string; ticker: string | null;
}
export interface MorningHeadline {
  headline: string; ticker: string | null; source: string; is_breaking: number;
}
export interface DayAheadEarning extends MorningEvent {
  session: "BMO" | "AMC" | "—";
  watchlist: boolean;
}
export interface DayAhead {
  synthesis: string;
  earnings_today: DayAheadEarning[];
  earnings_tomorrow: DayAheadEarning[];
  gex_line: string | null;
  watchlist_news: { ticker: string; headline: string }[];
}
export interface MorningReport {
  date: string; weekday: string; tone: string;
  generated_at?: string;
  macro?: { us_1d: number | null; global_1d: number | null };
  day_ahead?: DayAhead;
  futures: { symbol: string; change_pct: number }[];
  today_events: MorningEvent[];
  macro_events: MorningEvent[];
  earnings: MorningEvent[];
  headlines: MorningHeadline[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useMorningReport(opts?: { limit?: number; days?: number }) {
  const q = opts ? `?limit=${opts.limit ?? 6}&days=${opts.days ?? 7}` : "";
  return useSWR<MorningReport>(`/api/argus/report/morning${q}`, fetcher, {
    refreshInterval: 300_000, shouldRetryOnError: false,
  });
}

/**
 * One chip per ticker, carrying its newest headline — the raw list repeats a
 * ticker and burns the cap on it, and every chip used to read "$T news" with the
 * headline hidden in a title attribute (MB-01, MB-02).
 */
export function groupNewsByTicker(
  news: { ticker: string; headline: string }[]
): { ticker: string; headline: string; extra: number }[] {
  const out: { ticker: string; headline: string; extra: number }[] = [];
  const index = new Map<string, number>();
  for (const n of news) {
    const at = index.get(n.ticker);
    if (at === undefined) {
      index.set(n.ticker, out.length);
      out.push({ ticker: n.ticker, headline: n.headline, extra: 0 });
    } else {
      out[at].extra += 1;
    }
  }
  return out;
}

/** Events on `today` or the day after — the brief is a today document (MB-03). */
export function nearTermEvents(events: MorningEvent[], today: string): MorningEvent[] {
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d) + 86_400_000).toISOString().slice(0, 10);
  return events.filter((e) => e.date === today || e.date === tomorrow);
}

/** "just now" / "6m ago" / "2h ago" for the brief's as-of stamp (MB-09). */
export function asOf(generatedAt: string | undefined, nowMs = Date.now()): string | null {
  if (!generatedAt) return null;
  const at = new Date(generatedAt).getTime();
  if (!Number.isFinite(at)) return null;
  const mins = Math.max(0, Math.round((nowMs - at) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Strip the markdown bold used in the Obsidian render for plain dashboard text. */
export function plain(tone: string | null | undefined): string {
  if (!tone) return "";
  return tone.replace(/\*\*/g, "");
}
