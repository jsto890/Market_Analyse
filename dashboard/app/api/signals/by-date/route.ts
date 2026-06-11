import { NextRequest } from "next/server";
import { byDate } from "@/lib/signals";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return Response.json({ error: "date required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  return Response.json(byDate(date));
}
