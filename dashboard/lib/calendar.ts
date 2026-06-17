"use client";

import useSWR from "swr";

export interface CalEvent {
  date: string; time_et: string | null; event: string;
  category: string; importance: string; source: string; ticker: string | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useCalendar(days = 7) {
  return useSWR<{ today: string; days: number; events: CalEvent[] }>(
    `/api/argus/calendar?days=${days}`, fetcher,
    { refreshInterval: 300_000, shouldRetryOnError: false }
  );
}

/** "Today" / "Tmrw" / weekday for a YYYY-MM-DD relative to today (local). */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(date + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return "Tmrw";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function importanceColor(importance: string): string {
  return importance === "high" ? "bg-warn" : importance === "medium" ? "bg-accent" : "bg-muted";
}
