"use client";

import useSWR from "swr";
import { visibilityAwareInterval } from "@/lib/swr-visibility";

export interface CalEvent {
  date: string; time_et: string | null; event: string;
  category: string; importance: string; source: string; ticker: string | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useCalendar(days = 7) {
  return useSWR<{ today: string; days: number; events: CalEvent[] }>(
    `/api/argus/calendar?days=${days}`, fetcher,
    { refreshInterval: visibilityAwareInterval(300_000), shouldRetryOnError: false }
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

export function importanceMeta(importance: string): { cls: string; label: string } {
  if (importance === "high") return { cls: "w-1.5 h-1.5 rounded-sm bg-warn", label: "High importance" };
  if (importance === "medium") return { cls: "w-1 h-1 rounded-full bg-accent", label: "Medium importance" };
  return { cls: "w-1 h-1 rounded-full border border-muted bg-transparent", label: "Low importance" };
}
