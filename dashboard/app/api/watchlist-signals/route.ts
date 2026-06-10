import { NextResponse } from "next/server";
import { loadBridgeSignals } from "@/lib/bridge";
import type { BridgeRow } from "@/types/bridge";

export async function GET(): Promise<NextResponse> {
  const signals: BridgeRow[] = loadBridgeSignals();
  return NextResponse.json({ signals });
}
