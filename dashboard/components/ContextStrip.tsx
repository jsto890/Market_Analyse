"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import * as Tooltip from "@radix-ui/react-tooltip";
import { usMarketState, futuresMarketState, type UsMarketState } from "@/lib/market-clock";
import type { StatusPayload, DotState } from "@/lib/status";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

const SESSION_CHIP: Record<UsMarketState, string> = {
  pre: "PRE",
  regular: "RTH",
  after: "AH",
  closed: "CLOSED",
};

const DOT_CLASS: Record<DotState, string> = {
  ok: "bg-teal",
  warn: "bg-warn",
  down: "bg-neg",
  idle: "bg-muted",
};

function sessionChip(): string {
  const us = usMarketState();
  if (us === "closed" && futuresMarketState() === "open") return "OVN";
  return SESSION_CHIP[us];
}

function fmtBridgeTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 4px marker rendered beside items that changed since the last visit. */
function ChangedDot() {
  return <span className="inline-block w-1 h-1 rounded-full bg-warn align-middle ml-0.5" />;
}

interface Snapshot {
  regime: string | null;
  aggregate: DotState;
  aligned: number;
}

export default function ContextStrip() {
  const { data } = useSWR<StatusPayload>("/api/status", fetcher, {
    refreshInterval: 60_000,
    shouldRetryOnError: true,
  });
  const [changed, setChanged] = useState<{ regime: boolean; health: boolean; aligned: boolean }>({
    regime: false,
    health: false,
    aligned: false,
  });

  // Changed-since-last-visit: compare once per mount against the stored snapshot.
  useEffect(() => {
    if (!data) return;
    try {
      const raw = window.localStorage.getItem("strip-snapshot");
      if (raw) {
        const prev = JSON.parse(raw) as Snapshot;
        setChanged({
          regime: prev.regime !== data.regime,
          health: prev.aggregate !== data.aggregate,
          aligned: prev.aligned !== data.counts.aligned,
        });
      }
      const snap: Snapshot = {
        regime: data.regime,
        aggregate: data.aggregate,
        aligned: data.counts.aligned,
      };
      window.localStorage.setItem("strip-snapshot", JSON.stringify(snap));
    } catch {
      // localStorage unavailable — markers just stay off
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data == null]);

  const regime = data?.regime ?? null;
  const regimeText = regime
    ? `${regime.replace("_", "-")}${data?.chase != null ? ` · chase ${data.chase ? "ON" : "OFF"}` : ""}`
    : null;
  const regimeColor = regime?.toLowerCase().includes("on")
    ? "text-teal border-teal/40"
    : "text-warn border-warn/40";

  const aggregate: DotState = data?.aggregate ?? "idle";

  return (
    <div className="flex items-center gap-3 text-[13px] leading-none">
      {/* Cluster 1 — regime + session */}
      {regimeText && (
        <span className={`border rounded px-1.5 py-px font-medium ${regimeColor}`}>
          {regimeText}
          {changed.regime && <ChangedDot />}
        </span>
      )}
      <span className="text-muted font-mono text-[11px] border border-line rounded px-1 py-px select-none">
        {sessionChip()}
      </span>

      {/* Cluster 2 — freshness + aggregate health dot */}
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="text-muted font-mono tabular-nums cursor-default select-none flex items-center gap-1.5">
            {data?.sentiment
              ? `sent: ${data.sentiment.source} ${data.sentiment.ageHours.toFixed(0)}h`
              : "sent: —"}
            {" · "}bridge {fmtBridgeTime(data?.bridgeTime ?? null)}
            <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[aggregate]}`} />
            {changed.health && <ChangedDot />}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            className="rounded bg-elevated border border-line px-2 py-1 text-[12px] text-muted shadow-lg z-50"
          >
            {(data?.services ?? []).map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 py-0.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_CLASS[s.state]}`} />
                <span className="font-mono">{s.name}</span> — {s.detail}
              </div>
            ))}
            {!data && <div>status unavailable</div>}
            <Tooltip.Arrow className="fill-elevated" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>

      {/* Cluster 3 — counts, linked */}
      <span className="text-muted font-mono tabular-nums select-none">
        <Link href="/#signals" className="hover:text-white cursor-pointer">
          ALIGNED {data?.counts.aligned ?? 0}
          {changed.aligned && <ChangedDot />}
        </Link>
        {" · "}
        <Link href="/watchlist" className="hover:text-white cursor-pointer">
          watch {data?.counts.pullback ?? 0}
        </Link>
        {" · "}
        <Link href="/#day-ahead" className="hover:text-white cursor-pointer">
          earnings {data?.counts.earningsToday ?? 0}
        </Link>
      </span>
    </div>
  );
}
