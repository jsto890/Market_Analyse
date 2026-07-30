"use client";

import { useEffect, useState } from "react";
import { fetchOptionsLive, type LadderSnapshot } from "@/lib/optionsLive";
import { createLiveLadderPoller } from "@/lib/liveLadderPoller";

export interface LiveLadderState {
  ladder: LadderSnapshot | null;
  error: string | null;
  /** Consecutive failed polls since the last success — drives OL-06's staleness UI. */
  consecutiveFailures: number;
}

const INITIAL_STATE: LiveLadderState = { ladder: null, error: null, consecutiveFailures: 0 };

/** Self-scheduling live ladder poll, active only while `enabled`. Aborts and
 * stops on symbol/expiry change or unmount; pauses while the tab is hidden. */
export function useOptionsLivePoller(symbol: string, expiry: string, enabled: boolean): LiveLadderState {
  const [state, setState] = useState<LiveLadderState>(INITIAL_STATE);

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_STATE);
      return;
    }
    const controller = new AbortController();

    const poller = createLiveLadderPoller<LadderSnapshot>({
      fetch: async () => {
        const ladder = await fetchOptionsLive(symbol, expiry, controller.signal);
        if (!ladder) throw new Error("Live data unavailable");
        return ladder;
      },
      onSuccess: (ladder) => setState({ ladder, error: null, consecutiveFailures: 0 }),
      onError: () =>
        setState((prev) => ({
          ladder: prev.ladder,
          error: "Live data unavailable",
          consecutiveFailures: prev.consecutiveFailures + 1,
        })),
      baseIntervalMs: 500,
      maxIntervalMs: 5000,
      isPaused: () => typeof document !== "undefined" && document.hidden,
    });

    poller.start();
    return () => {
      poller.stop();
      controller.abort();
    };
  }, [symbol, expiry, enabled]);

  return state;
}
