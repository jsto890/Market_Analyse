"use client";

import useSWR from "swr";
import { odteBadge, type OdteHealth } from "@/lib/odte";

const ODTE_APP_URL = "http://127.0.0.1:8788/app";
const fetcher = (u: string) => fetch(u, { cache: "no-store" }).then((r) => r.json());
const toneClass: Record<string, string> = {
  live: "bg-green-500/20 text-green-400",
  warn: "bg-yellow-500/20 text-yellow-400",
  down: "bg-red-500/20 text-red-400",
};

export default function OdtePage() {
  const { data, error } = useSWR<OdteHealth>("/api/odte/health", fetcher, {
    refreshInterval: 5000,
    shouldRetryOnError: false,
  });
  const health = error ? null : data;
  const badge = odteBadge(health);
  const down = badge.tone === "down";

  return (
    <main className="flex flex-col font-mono h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line">
        <h1 className="text-sm font-semibold">Index 0DTE · QQQ</h1>
        <span className={`px-2 py-0.5 text-xs rounded ${toneClass[badge.tone]}`}>{badge.label}</span>
      </div>
      <div className="relative flex-1 min-h-0">
        {down ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            Ladder offline — 0DTE service not reachable.
          </div>
        ) : (
          <iframe src={ODTE_APP_URL} title="0DTE ladder" className="w-full h-full border-0" />
        )}
      </div>
    </main>
  );
}
