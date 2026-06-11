import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { BridgeRow } from "@/types/bridge";

export function resolveBridgePath(dir = process.env.BRIDGE_DIR): string {
  const base = dir ?? path.join(process.cwd(), "..", "reports");
  return path.join(base, "bridge_latest.csv");
}

export function loadBridgeSignals(): BridgeRow[] {
  const content = fs.readFileSync(resolveBridgePath(), "utf-8");
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transform: (v) => (v === "True" ? true : v === "False" ? false : v),
  });

  return result.data as unknown as BridgeRow[];
}
