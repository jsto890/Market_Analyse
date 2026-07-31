"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import * as Popover from "@radix-ui/react-popover";
import { type UsMarketState } from "@/lib/market-clock";
import { useMarketClock } from "@/lib/useMarketClock";
import type { StatusPayload, DotState } from "@/lib/status";
import { visibilityAwareInterval } from "@/lib/swr-visibility";
import { useRailQuotes } from "@/lib/rail-quotes";
import Stale from "@/components/ui/Stale";

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

const PILL_CLASS: Record<DotState, string> = {
  ok: "border-teal text-teal",
  warn: "border-warn text-warn",
  down: "border-neg text-neg",
  idle: "border-muted text-muted",
};

function sessionChip(clock: { us: UsMarketState; futures: "open" | "closed" }): string {
  if (clock.us === "closed" && clock.futures === "open") return "OVN";
  return SESSION_CHIP[clock.us];
}

export default function ContextStrip() {
  const clock = useMarketClock();
  const { data } = useSWR<StatusPayload>("/api/status", fetcher, {
    refreshInterval: visibilityAwareInterval(60_000),
    revalidateOnFocus: true,
    shouldRetryOnError: true,
  });

  const { updatedAt: quotesUpdatedAt } = useRailQuotes();

  // The chip names the session; this says how far into it you are — the
  // difference between "RTH" and "RTH, four minutes from the close". Set on
  // mount, never during SSR: a wall clock rendered on the server is a
  // hydration mismatch by construction.
  const [etTime, setEtTime] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setEtTime(
        new Date().toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const aggregate: DotState = data?.aggregate ?? "idle";

  return (
    <div className="flex items-center gap-3 text-body leading-none">
      {etTime && (
        <span className="font-mono text-micro text-muted select-none tabular-nums">
          {etTime} ET
        </span>
      )}

      {/* Session chip (e.g. OVN / RTH / PRE) */}
      <span className="text-muted font-mono text-micro border border-line rounded px-1 py-px select-none">
        {sessionChip(clock)}
      </span>

      {/* SYS health popover; click/Enter/Space opens service-status list */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="System status"
            className={`inline-flex items-center gap-1 rounded-sm border border-line border-l-2 bg-elevated px-1.5 py-px font-mono text-micro font-semibold tracking-wide select-none ${PILL_CLASS[aggregate]}`}
          >
            SYS
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            sideOffset={4}
            className="rounded bg-elevated border border-line px-2 py-1 text-body text-muted shadow-lg z-50 min-w-[180px]"
          >
            {(data?.services ?? []).map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 py-0.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_CLASS[s.state]}`} />
                <span className="font-mono">{s.name}</span> — {s.detail}
              </div>
            ))}
            {!data && <div>status unavailable</div>}
            <Popover.Arrow className="fill-elevated" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {data?.bridgeTime && (
        <Stale asOf={data.bridgeTime} source="bridge" variant="line" expectStale className="select-none" />
      )}
      {quotesUpdatedAt !== null && (
        <Stale asOf={quotesUpdatedAt} source="quotes" variant="line" className="select-none" />
      )}
    </div>
  );
}
