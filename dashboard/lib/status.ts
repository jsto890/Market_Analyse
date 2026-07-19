import fs from "fs";
import path from "path";
import { loadBridgeSignals } from "./bridge";
import { usMarketState } from "./market-clock";

export type DotState = "ok" | "warn" | "down" | "idle";
export interface ServiceStatus {
  name: "argus" | "ibkr" | "ingest";
  state: DotState;
  detail: string;
}
export interface StatusPayload {
  regime: string | null;
  chase: boolean | null;
  bridgeTime: string | null;
  sentiment: { source: string; ageHours: number } | null;
  services: ServiceStatus[];
  aggregate: DotState;
  counts: { aligned: number; pullback: number; tech_fund: number; earningsToday: number };
}

const SEVERITY: Record<DotState, number> = { ok: 0, idle: 1, warn: 2, down: 3 };

export function worstOf(states: DotState[]): DotState {
  return states.reduce<DotState>((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), "ok");
}

export function classifyAge(
  ageHours: number,
  opts: { warnAfter: number; downAfter: number; marketClosedNow: boolean },
): DotState {
  if (ageHours <= opts.warnAfter) return "ok";
  if (opts.marketClosedNow) return "idle"; // expected-stale: weekend/holiday
  return ageHours > opts.downAfter ? "down" : "warn";
}

function resolveMetaPath(): string {
  const base = process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
  return path.join(base, "bridge_meta.json");
}

function resolveSentimentMetaPath(): string {
  const base =
    process.env.MARKET_REVIEW_DIR ?? path.join(process.cwd(), "..", "..", "Market_Review");
  return path.join(base, "data", "state", "sentiment_meta.json");
}

interface BridgeMeta {
  generated_at?: string;
  regime?: string;
  chase_enabled?: boolean;
}

function readJsonSafe(p: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function computeCounts(): { aligned: number; pullback: number; tech_fund: number } {
  try {
    let aligned = 0, pullback = 0, tech_fund = 0;
    for (const row of loadBridgeSignals()) {
      if (row.group1) aligned++;
      else if (row.group2 && row.conviction === "high" && row.sentiment_score < 0.2) pullback++;
      else if (row.group2) tech_fund++;
    }
    return { aligned, pullback, tech_fund };
  } catch {
    return { aligned: 0, pullback: 0, tech_fund: 0 };
  }
}

async function fetchJson(url: string, timeoutMs = 1500): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function buildStatus(): Promise<StatusPayload> {
  const marketClosedNow = usMarketState() === "closed";
  const [argusHealth, odteHealth, calendar] = await Promise.all([
    fetchJson("http://127.0.0.1:8088/health"),
    fetchJson("http://127.0.0.1:8788/health"),
    fetchJson("http://127.0.0.1:8088/api/calendar?days=1"),
  ]);

  const bridgeMeta = readJsonSafe(resolveMetaPath()) as BridgeMeta | null;
  const bridgeTime = bridgeMeta?.generated_at ?? null;

  const sentMeta = readJsonSafe(resolveSentimentMetaPath());
  let sentiment: StatusPayload["sentiment"] = null;
  if (sentMeta && typeof sentMeta.last_success_utc === "string") {
    const ageHours = (Date.now() - new Date(sentMeta.last_success_utc).getTime()) / 3_600_000;
    sentiment = { source: String(sentMeta.source ?? "unknown"), ageHours: Math.round(ageHours * 10) / 10 };
  }

  const services: ServiceStatus[] = [
    argusHealth
      ? { name: "argus", state: "ok", detail: "API 8088 responding" }
      : { name: "argus", state: "down", detail: "API 8088 unreachable" },
    odteHealth
      ? odteHealth.ibkr_connected
        ? { name: "ibkr", state: "ok", detail: "Gateway connected (via odte)" }
        : { name: "ibkr", state: marketClosedNow ? "idle" : "down", detail: "Gateway not connected" }
      : { name: "ibkr", state: marketClosedNow ? "idle" : "warn", detail: "odte backend unreachable" },
    (() => {
      const bridgeAgeH = bridgeTime
        ? (Date.now() - new Date(bridgeTime).getTime()) / 3_600_000
        : Infinity;
      const state = classifyAge(bridgeAgeH, { warnAfter: 26, downAfter: 50, marketClosedNow });
      const detail = bridgeTime
        ? `last bridge run ${bridgeAgeH.toFixed(1)}h ago`
        : "bridge meta missing";
      return { name: "ingest" as const, state, detail };
    })(),
  ];

  let earningsToday = 0;
  const events = (calendar?.events ?? null) as Array<{ category?: string }> | null;
  if (Array.isArray(events)) {
    earningsToday = events.filter((e) => e.category === "earnings").length;
  }

  return {
    regime: bridgeMeta?.regime ?? null,
    chase: bridgeMeta?.chase_enabled ?? null,
    bridgeTime,
    sentiment,
    services,
    aggregate: worstOf(services.map((s) => s.state)),
    counts: { ...computeCounts(), earningsToday },
  };
}
