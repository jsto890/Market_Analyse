"use client";

import { useState } from "react";
import useSWR from "swr";
import { isOdteSymbol, odteBadge, odteSymbols, odteEtfSymbols, odteIndexSymbols, type OdteHealth, type OdteSymbol } from "@/lib/odte";
import { companionSymbol, type GexLevels } from "@/lib/odteCompanion";
import { useRailQuotes } from "@/lib/rail-quotes";
import GexCard from "@/components/odte/GexCard";
import UnusualCard from "@/components/odte/UnusualCard";
import PcrCard from "@/components/odte/PcrCard";
import SpotCard from "@/components/odte/SpotCard";

const ODTE_APP_URL = "http://127.0.0.1:8788/app";
const fetcher = (u: string) => fetch(u, { cache: "no-store" }).then((r) => r.json());
const toneClass: Record<string, string> = {
  live: "bg-green-500/20 text-green-400",
  warn: "bg-yellow-500/20 text-yellow-400",
  down: "bg-red-500/20 text-red-400",
};

export default function OdtePage() {
  const { data, error, mutate } = useSWR<OdteHealth>("/api/odte/health", fetcher, {
    refreshInterval: 5000,
    shouldRetryOnError: false,
  });
  const [pending, setPending] = useState<OdteSymbol | null>(null);
  const health = error ? null : data;
  const badge = odteBadge(health);
  const down = badge.tone === "down";
  const activeSymbol = health?.symbol && isOdteSymbol(health.symbol) ? health.symbol : undefined;
  const gridSymbol = activeSymbol ?? "QQQ";
  const { data: gexData } = useSWR<GexLevels>(
    `/api/odte/gex?symbol=${gridSymbol}`,
    (url: string) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      }),
    { refreshInterval: 60_000 }
  );
  const zeroGamma = gexData?.zero_gamma ?? null;
  const { data: railData } = useRailQuotes();
  const spot =
    railData?.quotes.find((q) => q.symbol === companionSymbol(gridSymbol))?.price ?? null;

  async function switchSymbol(symbol: OdteSymbol) {
    if (symbol === activeSymbol || pending !== null) return;
    setPending(symbol);
    try {
      await fetch("/api/odte/symbol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      await mutate();
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="flex flex-col font-mono h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line">
        <h1 className="text-sm font-semibold">Index 0DTE{activeSymbol ? ` · ${activeSymbol}` : ""}</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded border border-line overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">ETF</span>
              {odteEtfSymbols.map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => switchSymbol(symbol)}
                  disabled={down}
                  className={`px-2 py-0.5 text-xs ${
                    symbol === activeSymbol
                      ? "bg-green-500/20 text-green-400"
                      : symbol === pending
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "text-muted"
                  }`}
                >
                  {symbol}
                </button>
              ))}
            </div>
            <span className="w-px h-4 bg-line mx-1" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">INDEX</span>
              {odteIndexSymbols.map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => switchSymbol(symbol)}
                  disabled={down}
                  className={`px-2 py-0.5 text-xs ${
                    symbol === activeSymbol
                      ? "bg-green-500/20 text-green-400"
                      : symbol === pending
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "text-muted"
                  }`}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
          <span className={`px-2 py-0.5 text-xs rounded ${toneClass[badge.tone]}`}>{badge.label}</span>
        </div>
      </div>
      <div className="relative h-[62vh] min-h-[420px]">
        {down ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            Ladder offline — 0DTE service not reachable.
          </div>
        ) : (
          <iframe src={ODTE_APP_URL} title="0DTE ladder" className="w-full h-full border-0" />
        )}
      </div>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
        <GexCard symbol={gridSymbol} />
        <UnusualCard symbol={gridSymbol} />
        <PcrCard symbol={gridSymbol} />
        <SpotCard symbol={gridSymbol} spot={spot} zeroGamma={zeroGamma} />
      </section>
    </main>
  );
}
