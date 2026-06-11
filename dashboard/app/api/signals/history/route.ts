import { NextRequest } from "next/server";
import { signalHistory } from "@/lib/signals";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return Response.json({ error: "ticker required" }, { status: 400 });
  return Response.json(signalHistory(ticker));
}
