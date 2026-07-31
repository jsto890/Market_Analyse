"use client";

import useSWR from "swr";
import CompanionCard from "@/components/odte/CompanionCard";
import { fmtGex, type GexLevels } from "@/lib/odteCompanion";
import type { OdteSymbol } from "@/lib/odte";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export default function GexCard({ symbol }: { symbol: OdteSymbol }) {
  const { data, error, isLoading } = useSWR<GexLevels>(
    `/api/odte/gex?symbol=${symbol}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const empty = !isLoading && (!!error || !data);

  const row = (label: string, value: string) => (
    <div className="flex justify-between font-mono text-micro tabular-nums">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );

  return (
    <CompanionCard
      symbol={symbol}
      title="Gamma exposure"
      asOf={data?.date}
      loading={isLoading}
      empty={empty}
    >
      {data && (
        <div className="space-y-1">
          {row("zero-gamma", data.zero_gamma != null ? String(data.zero_gamma) : "—")}
          {row("call wall", data.call_wall != null ? String(data.call_wall) : "—")}
          {row("put wall", data.put_wall != null ? String(data.put_wall) : "—")}
          <div className="flex justify-between font-mono text-micro tabular-nums">
            <span className="text-muted">total GEX</span>
            <span className={(data.total_gex ?? 0) >= 0 ? "text-pos" : "text-neg"}>
              {fmtGex(data.total_gex)}
            </span>
          </div>
          <p className="text-micro text-muted pt-1 border-t border-line">
            OI-based · overnight book
          </p>
        </div>
      )}
    </CompanionCard>
  );
}
