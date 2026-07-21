export const odteSymbols = ["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"] as const;
export const odteEtfSymbols = odteSymbols.slice(0, 4);
export const odteIndexSymbols = odteSymbols.slice(4);
export type OdteSymbol = (typeof odteSymbols)[number];

export function isOdteSymbol(value: string): value is OdteSymbol {
  return (odteSymbols as readonly string[]).includes(value);
}

export interface OdteHealth {
  ok: boolean;
  ibkr_connected: boolean;
  subscriptions?: number;
  server_ts_ms?: number;
  symbol?: string;
}

export type OdteTone = "live" | "warn" | "down";

export interface OdteBadge {
  label: string;
  tone: OdteTone;
}

export function odteBadge(health: OdteHealth | null | undefined): OdteBadge {
  if (!health || !health.ok) return { label: "Service down", tone: "down" };
  if (!health.ibkr_connected) return { label: "IBKR disconnected", tone: "warn" };
  return { label: "Live", tone: "live" };
}

export interface LadderContract {
  oi: number | null;
  vol: number | null;
  last: number | null;
  iv: number | null;
}

export interface LadderRow {
  strike: number;
  call: LadderContract | null;
  put: LadderContract | null;
  gex: number;
}

export interface LadderExpiry {
  expiry: string;
  expected_move_pct: number;
  rows: LadderRow[];
}

export interface LadderLevels {
  zero_gamma: number | null;
  call_wall: number | null;
  put_wall: number | null;
  total_gex: number | null;
}

export interface LadderPayload {
  symbol: string;
  snap_date: string;
  spot: number;
  levels: LadderLevels;
  expiries: LadderExpiry[];
}

/** Nearest strike row to a target level (e.g. zero-gamma or a wall). */
export function nearestStrikeIndex(rows: { strike: number }[], target: number | null): number {
  if (target == null || rows.length === 0) return -1;
  let bestIdx = 0;
  let bestDist = Infinity;
  rows.forEach((r, i) => {
    const dist = Math.abs(r.strike - target);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  });
  return bestIdx;
}
