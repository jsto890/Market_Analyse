"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";

interface GexLevels {
  date: string; symbol: string; expiry: string;
  zero_gamma: number | null; call_wall: number | null; put_wall: number | null;
  total_gex: number | null; caveat: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export default function GexCard({ ticker }: { ticker: string }) {
  const { data, error } = useSWR<GexLevels>(`/api/argus/gex/${ticker}`, fetcher, {
    refreshInterval: 300_000,
    shouldRetryOnError: false,
  });
  if (error) return null; // 404 = no levels yet (first close snapshot pending) — card simply absent
  if (!data) return null;
  const row = (label: string, v: number | null) => (
    <div className="flex justify-between font-mono text-[12px] tabular-nums">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{v !== null ? v.toFixed(2) : "—"}</span>
    </div>
  );
  return (
    <Panel title={`Gamma levels · ${data.expiry}`}>
      <div className="space-y-1">
        {row("zero gamma", data.zero_gamma)}
        {row("call wall", data.call_wall)}
        {row("put wall", data.put_wall)}
        <p className="font-mono text-[10px] text-muted pt-1 border-t border-line">
          {data.caveat} · {data.date}
        </p>
      </div>
    </Panel>
  );
}
