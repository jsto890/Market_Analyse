"use client";

import useSWR from "swr";

export interface MorningEvent {
  date: string; time_et: string | null; event: string;
  category: string; importance: string; ticker: string | null;
}
export interface MorningHeadline {
  headline: string; ticker: string | null; source: string; is_breaking: number;
}
export interface MorningReport {
  date: string; weekday: string; tone: string;
  futures: { symbol: string; change_pct: number }[];
  today_events: MorningEvent[];
  macro_events: MorningEvent[];
  earnings: MorningEvent[];
  headlines: MorningHeadline[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useMorningReport() {
  return useSWR<MorningReport>("/api/argus/report/morning", fetcher, {
    refreshInterval: 300_000, shouldRetryOnError: false,
  });
}

/** Strip the markdown bold used in the Obsidian render for plain dashboard text. */
export function plain(tone: string): string {
  return tone.replace(/\*\*/g, "");
}
