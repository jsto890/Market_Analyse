"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import * as Popover from "@radix-ui/react-popover";
import type { UsMarketState } from "@/lib/market-clock";
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

const SESSION_WORD: Record<UsMarketState, string> = {
  pre: "PRE",
  regular: "OPEN",
  after: "AFTER",
  closed: "CLOSED",
};

const SESSION_DOT: Record<string, string> = {
  OPEN: "bg-pos",
  PRE: "bg-warn",
  AFTER: "bg-warn",
  OVERNIGHT: "bg-muted",
  CLOSED: "bg-muted",
};

const DOT_CLASS: Record<DotState, string> = {
  ok: "bg-teal",
  warn: "bg-warn",
  down: "bg-neg",
  idle: "bg-muted",
};

function sessionWord(clock: { us: UsMarketState; futures: "open" | "closed" }): string {
  if (clock.us === "closed" && clock.futures === "open") return "OVERNIGHT";
  return SESSION_WORD[clock.us];
}

/**
 * One clock, and one only. The nav used to end in five: an ET time, a session
 * chip, a SYS pill, the bridge age and the quote age — seven facts fighting for
 * the same 46px, none of them read more than once a session. What stays is the
 * session and the time. What moves in here is everything that answers "is this
 * data current?" — a question you ask, not one that should be shouted at you.
 */
export default function ContextStrip() {
  const clock = useMarketClock();
  const { data } = useSWR<StatusPayload>("/api/status", fetcher, {
    refreshInterval: visibilityAwareInterval(60_000),
    revalidateOnFocus: true,
    shouldRetryOnError: true,
  });

  const { updatedAt: quotesUpdatedAt } = useRailQuotes();

  // Set on mount, never during SSR: a wall clock rendered on the server is a
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

  const session = sessionWord(clock);
  const aggregate: DotState = data?.aggregate ?? "idle";
  // The dot names the session. It only borrows the health colour when health is
  // the more urgent fact — a dead feed outranks an open bell.
  const dot =
    aggregate === "down" ? "bg-neg" : aggregate === "warn" ? "bg-warn" : SESSION_DOT[session];
  const tone = aggregate === "down" ? "text-neg" : aggregate === "warn" ? "text-warn" : "text-3";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Session and data status"
          className={`flex select-none items-center gap-1.5 font-mono text-micro leading-none tracking-normal ${tone} hover:text-foreground`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
          {session}
          {etTime && <span className="tabular-nums">· {etTime} ET</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-50 min-w-[240px] rounded-md border border-line bg-elevated p-2.5 text-body text-muted shadow-lg"
        >
          <div className="flex flex-col gap-1.5">
            {(data?.services ?? []).map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASS[s.state]}`} />
                <span className="font-mono">{s.name}</span> — {s.detail}
              </div>
            ))}
            {!data && <div>status unavailable</div>}
            {(data?.bridgeTime || quotesUpdatedAt !== null) && (
              <div className="mt-0.5 flex flex-col gap-1 border-t border-line pt-1.5">
                {data?.bridgeTime && (
                  <Stale asOf={data.bridgeTime} source="bridge" variant="line" expectStale />
                )}
                {quotesUpdatedAt !== null && (
                  <Stale asOf={quotesUpdatedAt} source="quotes" variant="line" />
                )}
              </div>
            )}
          </div>
          <Popover.Arrow className="fill-elevated" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
