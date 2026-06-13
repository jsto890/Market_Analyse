"use client";

import useSWR from "swr";

interface Catalysts {
  next_earnings: string | null;
  last_earnings: { date: string; surprise_pct: number | null; reaction_pct: number | null } | null;
  analyst: { date: string; firm: string; to: string; action: string }[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

export default function CatalystStrip({ ticker }: { ticker: string }) {
  const { data } = useSWR<Catalysts>(`/api/argus/catalysts/${ticker}`, fetcher, {
    refreshInterval: 3_600_000, shouldRetryOnError: false,
  });
  if (!data) return null;
  const parts: React.ReactNode[] = [];
  if (data.last_earnings) {
    const r = data.last_earnings.reaction_pct;
    parts.push(
      <span key="le">
        earnings {fmtDate(data.last_earnings.date)}
        {r !== null ? (
          <span className={r >= 0 ? "text-pos" : "text-neg"}>
            {" "}({r >= 0 ? "+" : ""}{r.toFixed(1)}%)
          </span>
        ) : null}
      </span>
    );
  }
  if (data.next_earnings) parts.push(<span key="ne">next earnings {fmtDate(data.next_earnings)}</span>);
  const a = data.analyst[0];
  if (a) parts.push(<span key="an">{a.firm} {a.action === "up" ? "↑" : a.action === "down" ? "↓" : "→"} {a.to} {fmtDate(a.date)}</span>);
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[12px] text-muted mt-1 px-0.5">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-line">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}
