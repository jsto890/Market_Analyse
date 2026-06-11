import { reportDates } from "@/lib/signals";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(reportDates());
}
