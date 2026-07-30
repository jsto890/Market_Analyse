const KEY = "dash:ticker-nav";

export interface TickerNavState {
  group: string;
  tickers: string[];
}

export function setTickerNav(group: string, tickers: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ group, tickers }));
  } catch {
    // sessionStorage unavailable (private mode, SSR) — nav degrades to breadcrumb-only
  }
}

export function getTickerNav(): TickerNavState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as TickerNavState).group === "string" &&
      Array.isArray((parsed as TickerNavState).tickers)
    ) {
      return parsed as TickerNavState;
    }
    return null;
  } catch {
    return null;
  }
}
