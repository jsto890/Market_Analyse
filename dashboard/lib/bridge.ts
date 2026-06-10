import fs from "fs";
import Papa from "papaparse";
import type { BridgeRow } from "@/types/bridge";

const CSV_PATH = "/Users/josephstorey/Market_Analyse/reports/bridge_latest.csv";

export function loadBridgeSignals(): BridgeRow[] {
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => ({
    ...row,
    high_conviction: row.high_conviction === "True" || row.high_conviction === true,
    cluster_confirmed: row.cluster_confirmed === "True" || row.cluster_confirmed === true,
    is_extended: row.is_extended === "True" || row.is_extended === true,
  })) as BridgeRow[];
}
