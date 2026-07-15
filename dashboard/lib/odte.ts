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
