import { NextRequest } from "next/server";
import { recentFirstFlags } from "@/lib/signals";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("days") ?? "14";
  if (!/^\d+$/.test(raw)) return Response.json({ error: "days must be a positive integer" }, { status: 400 });
  const days = parseInt(raw, 10);
  if (days < 1) return Response.json({ error: "days must be a positive integer" }, { status: 400 });
  if (days > 365) return Response.json({ error: "days must not exceed 365" }, { status: 400 });
  return Response.json(recentFirstFlags(days));
}
