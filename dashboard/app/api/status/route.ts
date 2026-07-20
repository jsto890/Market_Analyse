import { NextResponse } from "next/server";
import { buildStatus, type StatusPayload } from "@/lib/status";

export const dynamic = "force-dynamic";

let cache: { at: number; payload: StatusPayload } | null = null;
const CACHE_MS = 7_000;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload);
  }
  const payload = await buildStatus();
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload);
}
