"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { useLocalStorage } from "@/lib/useLocalStorage";
import type { BridgeRow } from "@/types/bridge";

interface LevelsCardProps {
  bridgeRow: BridgeRow;
}

const STOP_ANCHOR_LABELS: Record<string, string> = {
  ema_50: "Stop rides the 50-day EMA",
  supertrend: "Stop tracks the SuperTrend line",
  psar: "Stop at the parabolic SAR",
  swing_low: "Stop under the last swing low",
};

function stopAnchorLabel(anchor: string): string {
  return STOP_ANCHOR_LABELS[anchor] ?? anchor;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="text-muted text-[11px] font-mono leading-none cursor-default select-none ml-1"
          aria-label="info"
        >
          i
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[240px]"
          sideOffset={4}
        >
          {text}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export default function LevelsCard({ bridgeRow }: LevelsCardProps) {
  const [riskUsd, setRiskUsd] = useLocalStorage("dash:riskUsd", 500);

  const { entry, stop, target, risk_reward, stop_anchor } = bridgeRow;

  const shares =
    entry > stop ? Math.floor(riskUsd / (entry - stop)) : null;

  const rrLabel =
    risk_reward != null ? risk_reward.toFixed(2) : "—";

  const anchorLabel = stop_anchor ? stopAnchorLabel(stop_anchor) : null;

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <span className="font-medium text-[13px]">Levels</span>
        <InfoTooltip text="Indicative levels only — not an exit system. Mechanical exits backtested ~breakeven." />
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* E / S / T / R:R grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Entry</p>
            <p className="font-mono text-[14px] tabular-nums text-foreground">
              {entry?.toFixed(2) ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Stop</p>
            <p className="font-mono text-[14px] tabular-nums text-neg">
              {stop?.toFixed(2) ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Target</p>
            <p className="font-mono text-[14px] tabular-nums text-pos">
              {target?.toFixed(2) ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">R:R</p>
            <p className="font-mono text-[14px] tabular-nums text-foreground">
              {rrLabel}
            </p>
          </div>
        </div>

        {/* Stop anchor sentence */}
        {anchorLabel && (
          <p className="text-[12px] text-muted">{anchorLabel}</p>
        )}

        {/* Size calculator */}
        <div className="border-t border-line pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted font-mono">Risk $</label>
            <input
              type="number"
              min={0}
              step={50}
              value={riskUsd}
              onChange={(e) => setRiskUsd(Number(e.target.value))}
              className="w-20 rounded border border-line bg-elevated px-2 py-0.5 font-mono text-[12px] text-foreground tabular-nums focus:outline-none focus:border-accent"
            />
            {shares !== null && (
              <span className="font-mono text-[13px] tabular-nums text-foreground ml-2">
                = {shares} shares
              </span>
            )}
          </div>
        </div>

        {/* Footnote */}
        <p className="text-[10px] text-muted leading-snug pt-1">
          Calculator only — levels are context, not an exit system (mechanical exits backtested ~breakeven).
        </p>
      </div>
    </section>
  );
}
