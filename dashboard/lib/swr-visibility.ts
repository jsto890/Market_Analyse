"use client";

/** SWR `refreshInterval` factory that pauses polling while the document is
 * hidden (backgrounded/minimised tab) and resumes at `intervalMs` once
 * visible again. Pair with `revalidateOnFocus: true` so returning to the
 * tab revalidates immediately instead of waiting for the next tick (G-13). */
export function visibilityAwareInterval(intervalMs: number): () => number {
  return () => (typeof document !== "undefined" && document.hidden ? 0 : intervalMs);
}
