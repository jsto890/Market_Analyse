/**
 * Pure, DOM-free self-scheduling poller (OL-05). No setInterval — each cycle
 * schedules its own next setTimeout only after the current fetch settles, so
 * a slow or hung request can never overlap with a fresh one. Consumed by
 * useOptionsLivePoller.ts, which supplies the React/DOM concerns (state,
 * AbortController, document.hidden).
 */

export interface PollerOptions<T> {
  fetch: () => Promise<T>;
  onSuccess: (data: T) => void;
  onError: (error: unknown) => void;
  /** Delay after a healthy poll. Default: 500. */
  baseIntervalMs?: number;
  /** Ceiling for the exponential backoff below. Default: 5000. */
  maxIntervalMs?: number;
  /** Polling is skipped (but the timer keeps ticking at baseIntervalMs) while this returns true — e.g. `() => document.hidden`. */
  isPaused?: () => boolean;
}

export interface Poller {
  start(): void;
  stop(): void;
}

/** Delay before the next attempt, given how many consecutive failures preceded it. */
export function computeBackoffDelay(
  consecutiveFailures: number,
  baseIntervalMs: number,
  maxIntervalMs: number
): number {
  if (consecutiveFailures <= 0) return baseIntervalMs;
  const backoff = baseIntervalMs * Math.pow(2, consecutiveFailures);
  return Math.min(backoff, maxIntervalMs);
}

export function createLiveLadderPoller<T>(opts: PollerOptions<T>): Poller {
  const baseIntervalMs = opts.baseIntervalMs ?? 500;
  const maxIntervalMs = opts.maxIntervalMs ?? 5000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let inFlight = false;
  let consecutiveFailures = 0;

  async function tick(): Promise<void> {
    if (stopped) return;
    if (opts.isPaused?.() || inFlight) {
      timer = setTimeout(tick, baseIntervalMs);
      return;
    }
    inFlight = true;
    try {
      const data = await opts.fetch();
      inFlight = false;
      if (stopped) return;
      consecutiveFailures = 0;
      opts.onSuccess(data);
    } catch (err) {
      inFlight = false;
      if (stopped) return;
      consecutiveFailures += 1;
      opts.onError(err);
    }
    if (stopped) return;
    const delay = computeBackoffDelay(consecutiveFailures, baseIntervalMs, maxIntervalMs);
    timer = setTimeout(tick, delay);
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      consecutiveFailures = 0;
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
