import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ARGUS_BASE = "http://127.0.0.1:8088/api";
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function getWatchlist() {
  return getDb()
    .prepare("SELECT * FROM watchlist ORDER BY pinned_at DESC")
    .all();
}

export function GET() {
  return Response.json({ watchlist: getWatchlist() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw: string | undefined = body?.ticker;
  if (!raw) return Response.json({ error: "ticker required" }, { status: 400 });
  const ticker = raw.trim().toUpperCase();
  if (!TICKER_RE.test(ticker))
    return Response.json({ error: "invalid ticker" }, { status: 400 });

  let price_at_pin: number | null = null;
  try {
    const res = await fetch(`${ARGUS_BASE}/quote/${ticker}`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const p = data?.price ?? data?.last ?? data?.close ?? null;
      price_at_pin = typeof p === "number" ? p : null;
    }
  } catch {
    // Argus offline — pin without price
  }

  getDb()
    .prepare(
      "INSERT OR IGNORE INTO watchlist(ticker, pinned_at, price_at_pin) VALUES(?,?,?)"
    )
    .run(ticker, new Date().toISOString(), price_at_pin);

  return Response.json({ watchlist: getWatchlist() });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw: string | undefined = body?.ticker;
  if (!raw) return Response.json({ error: "ticker required" }, { status: 400 });
  const ticker = raw.trim().toUpperCase();
  getDb().prepare("DELETE FROM watchlist WHERE ticker=?").run(ticker);
  return Response.json({ watchlist: getWatchlist() });
}
