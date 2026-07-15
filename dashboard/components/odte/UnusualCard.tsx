"use client";

import useSWR from "swr";
import CompanionCard from "@/components/odte/CompanionCard";
import type { UnusualPayload } from "@/lib/odteCompanion";
import type { OdteSymbol } from "@/lib/odte";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

function sideColor(side: string): string {
  const s = side.toUpperCase();
  if (s.startsWith("C")) return "text-pos";
  if (s.startsWith("P")) return "text-neg";
  return "text-foreground";
}

export default function UnusualCard({ symbol }: { symbol: OdteSymbol }) {
  const { data, error, isLoading } = useSWR<UnusualPayload>(
    `/api/odte/unusual?symbol=${symbol}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const empty = !isLoading && (!!error || !data || data.rows.length === 0);

  return (
    <CompanionCard
      symbol={symbol}
      title="Unusual activity"
      asOf={data?.as_of}
      loading={isLoading}
      empty={empty}
    >
      {data && (
        <div className="font-mono text-[11px] space-y-1">
          {data.rows.slice(0, 5).map((row, i) => (
            <div key={`${row.contract}-${i}`} className="flex justify-between gap-2 tabular-nums">
              <span className="truncate text-foreground">{row.contract}</span>
              <span className="flex gap-2 flex-shrink-0">
                <span className={sideColor(row.side)}>{row.side}</span>
                <span className="text-muted">{row.score.toFixed(1)}</span>
                <span className="text-muted">
                  {row.vol ?? "—"}/{row.oi ?? "—"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </CompanionCard>
  );
}
