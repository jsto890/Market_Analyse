// Known limitation: US market holidays are treated as their weekday session state.
export type UsMarketState = "pre" | "regular" | "after" | "closed";

/** US equity session state, DST-safe via Intl (no schedule data, no holidays). */
export function usMarketState(now: Date = new Date()): UsMarketState {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return "closed";
  const mins = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "after";
  return "closed";
}

export const STATE_LABEL: Record<UsMarketState, string> = {
  pre: "PRE",
  regular: "REG",
  after: "AFTER",
  closed: "CLOSED",
};
