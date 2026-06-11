import fs from "fs";
import path from "path";
import * as Tooltip from "@radix-ui/react-tooltip";
import { loadBridgeSignals, resolveBridgePath } from "@/lib/bridge";

interface BridgeMeta {
  generated_at?: string;
  regime?: string;
  chase_enabled?: boolean;
  counts?: {
    aligned?: number;
    pullback?: number;
    tech_fund?: number;
  };
}

function resolveMetaPath(): string {
  const base = process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
  return path.join(base, "bridge_meta.json");
}

function computeCounts(): { aligned: number; pullback: number; tech_fund: number } {
  try {
    const rows = loadBridgeSignals();
    let aligned = 0;
    let pullback = 0;
    let tech_fund = 0;
    for (const row of rows) {
      if (row.group1) {
        aligned++;
      } else if (row.group2 && row.conviction === "high" && row.sentiment_score < 0.2) {
        pullback++;
      } else if (row.group2) {
        tech_fund++;
      }
    }
    return { aligned, pullback, tech_fund };
  } catch {
    return { aligned: 0, pullback: 0, tech_fund: 0 };
  }
}

function freshnessClass(generatedAt: string | null): "pos" | "warn" | "neg" {
  if (!generatedAt) return "neg";
  const ms = Date.now() - new Date(generatedAt).getTime();
  const hours = ms / 3_600_000;
  if (hours < 24) return "pos";
  if (hours < 48) return "warn";
  return "neg";
}

function formatTime(generatedAt: string | null): string {
  if (!generatedAt) return "—";
  const d = new Date(generatedAt);
  return d.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function ContextStrip() {
  let meta: BridgeMeta | null = null;
  let generatedAt: string | null = null;

  try {
    const raw = fs.readFileSync(resolveMetaPath(), "utf-8");
    meta = JSON.parse(raw) as BridgeMeta;
    generatedAt = meta.generated_at ?? null;
  } catch {
    try {
      const stat = fs.statSync(resolveBridgePath());
      generatedAt = stat.mtime.toISOString();
    } catch {
      generatedAt = null;
    }
  }

  const counts = meta?.counts
    ? {
        aligned: meta.counts.aligned ?? 0,
        pullback: meta.counts.pullback ?? 0,
        tech_fund: meta.counts.tech_fund ?? 0,
      }
    : computeCounts();

  const freshClass = freshnessClass(generatedAt);
  const timeStr = formatTime(generatedAt);
  const freshSymbol = freshClass === "pos" ? "✓" : "!";

  const freshTitle =
    freshClass === "neg"
      ? "run_daily may have failed"
      : freshClass === "warn"
      ? "Data is 24–48h old"
      : "Data is fresh";

  const freshColor =
    freshClass === "pos"
      ? "text-pos"
      : freshClass === "warn"
      ? "text-warn"
      : "text-neg";

  const regimeText =
    meta?.regime != null
      ? `◇ ${meta.regime.replace("_", "-")}${meta.chase_enabled != null ? ` · chase ${meta.chase_enabled ? "ON" : "OFF"}` : ""}`
      : null;

  const regimeColor =
    meta?.regime?.toLowerCase().includes("risk_on") || meta?.regime?.toLowerCase().includes("on")
      ? "text-teal border-teal/40"
      : "text-warn border-warn/40";

  return (
    <div className="flex items-center gap-3 text-[13px] leading-none">
      {regimeText && (
        <span className={`border rounded px-1.5 py-px font-medium ${regimeColor}`}>
          {regimeText}
        </span>
      )}

      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="text-muted font-mono tabular-nums cursor-default select-none">
            bridge {timeStr}{" "}
            <span className={freshColor} title={freshTitle}>
              {freshSymbol}
            </span>{" "}
            · {counts.aligned}/{counts.pullback}/{counts.tech_fund}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            className="rounded bg-elevated border border-line px-2 py-1 text-[12px] text-muted shadow-lg z-50"
          >
            aligned / pullback / tech+fund
            <Tooltip.Arrow className="fill-elevated" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}
