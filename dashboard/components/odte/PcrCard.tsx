"use client";

import useSWR from "swr";
import CompanionCard from "@/components/odte/CompanionCard";
import { pcrTone, type PcrPayload } from "@/lib/odteCompanion";
import type { OdteSymbol } from "@/lib/odte";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

const toneClass: Record<string, string> = {
  live: "text-call",
  warn: "text-muted",
  down: "text-put",
};

export default function PcrCard({ symbol }: { symbol: OdteSymbol }) {
  const { data, error, isLoading } = useSWR<PcrPayload>(
    `/api/odte/pcr?symbol=${symbol}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const empty = !isLoading && (!!error || !data);

  return (
    <CompanionCard
      symbol={symbol}
      title="Put/call ratio"
      asOf={data?.as_of}
      loading={isLoading}
      empty={empty}
    >
      {data && (
        <div className="space-y-1">
          <div className={`text-data font-semibold ${toneClass[pcrTone(data.pcr_vol)]}`}>
            {data.pcr_vol != null ? data.pcr_vol.toFixed(2) : "—"}
          </div>
          <div className="text-data text-muted">
            OI {data.pcr_oi != null ? data.pcr_oi.toFixed(2) : "—"}
          </div>
          <div className="text-data text-muted">
            puts {data.put_vol} / calls {data.call_vol}
          </div>
        </div>
      )}
    </CompanionCard>
  );
}
