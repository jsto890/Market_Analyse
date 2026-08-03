import type { BridgeRow } from "@/types/bridge";

export type StatusMessage = { level: "error" | "warn"; text: string };

function formatTime(generatedAt: string | null): string {
  if (!generatedAt) return "unknown";
  const d = new Date(generatedAt);
  return d.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function statusMessage({
  rows,
  stale,
  generatedAt,
}: {
  rows: BridgeRow[];
  stale: boolean;
  generatedAt: string | null;
}): StatusMessage | null {
  if (rows.length === 0) {
    return { level: "error", text: "No bridge data — run_daily may have failed" };
  }
  if (stale) {
    return {
      level: "warn",
      text: `Bridge data is stale (generated ${formatTime(generatedAt)}) — run_daily may have failed`,
    };
  }
  return null;
}
