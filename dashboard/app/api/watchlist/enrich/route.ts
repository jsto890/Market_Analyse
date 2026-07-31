import { NextRequest } from "next/server";
import { lastSignalDates } from "@/lib/signals";

export const dynamic = "force-dynamic";

const ARGUS_BASE = "http://127.0.0.1:8088/api";
/** Argus serves one symbol per call, so the fan-out has to live somewhere. It
 *  lives here, once, instead of in every component that wants a watchlist
 *  priced — the browser makes a single request for the whole list. */
const CONCURRENCY = 5;
const MAX_TICKERS = 100;

export interface EnrichedTicker {
  last: number | null;
  /** Close 5 and 21 sessions back — the 1W and 1M reference points. */
  w5: number | null;
  m21: number | null;
  /** Most recent report date this ticker appeared on, when asked for. */
  lastSignal?: string | null;
}

function closes(data: unknown): number[] {
  if (!data || typeof data !== "object") return [];
  const bars = (data as { bars?: unknown }).bars;
  if (!Array.isArray(bars)) return [];
  return (bars as Record<string, unknown>[]).map((b) => Number(b.close ?? 0));
}

function back(cs: number[], n: number): number | null {
  return cs.length > n ? cs[cs.length - 1 - n] : null;
}

async function history(ticker: string): Promise<EnrichedTicker> {
  try {
    const res = await fetch(`${ARGUS_BASE}/history/${ticker}?period=6mo`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15000),
    });
    const cs = closes(await res.json());
    return { last: back(cs, 0), w5: back(cs, 5), m21: back(cs, 21) };
  } catch {
    return { last: null, w5: null, m21: null };
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, MAX_TICKERS);
  if (tickers.length === 0) return Response.json({});

  const out: Record<string, EnrichedTicker> = {};
  let idx = 0;
  async function worker() {
    while (idx < tickers.length) {
      const ticker = tickers[idx++];
      out[ticker] = await history(ticker);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (req.nextUrl.searchParams.get("signals") === "1") {
    for (const t of tickers) out[t].lastSignal = null;
    for (const row of lastSignalDates(tickers)) {
      if (out[row.ticker]) out[row.ticker].lastSignal = row.last_date;
    }
  }

  return Response.json(out);
}
