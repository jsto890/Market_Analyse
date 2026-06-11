import { NextRequest } from "next/server";
import { recentFirstFlags } from "@/lib/signals";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("days") ?? "14";
  const days = parseInt(raw, 10);
  if (isNaN(days) || days < 1) return Response.json({ error: "days must be a positive integer" }, { status: 400 });
  return Response.json(recentFirstFlags(days));
}
