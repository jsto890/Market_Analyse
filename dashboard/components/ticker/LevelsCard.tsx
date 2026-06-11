"use client";

import useSWR from "swr";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useLocalStorage } from "@/lib/useLocalStorage";
import type { BridgeRow } from "@/types/bridge";

interface QuoteData {
  price: number;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

interface LevelsCardProps {
  ticker: string;
  bridgeRow: BridgeRow;
}

function stopAnchorLabel(anchor: string): string {
  const n = anchor.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (n.startsWith("supertrend")) return "Stop tracks the SuperTrend line";
  if (n.startsWith("psar")) return "Stop at the parabolic SAR";
  if (n.startsWith("swinglow")) return "Stop under the last swing low";
  if (n.startsWith("ema50") || n.startsWith("sma50")) return "Stop rides the 50-day moving average";
  if (n.startsWith("ema200") || n.startsWith("sma200")) return "Stop rides the 200-day moving average";
  if (n.startsWith("atr")) return "Stop set via ATR volatility band";
  return anchor;
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

export default function LevelsCard({ ticker, bridgeRow }: LevelsCardProps) {
  const [riskUsd, setRiskUsd] = useLocalStorage("dash:riskUsd", 500);

  const { data: quote } = useSWR<QuoteData>(
    `/api/argus/quote/${ticker}`,
    fetcher,
    { refreshInterval: 30000, shouldRetryOnError: false }
  );

  const { entry, stop, target, risk_reward, stop_anchor } = bridgeRow;

  const livePrice = quote?.price ?? null;

  const distToEntry =
    Number.isFinite(entry) && entry !== null && entry !== 0 &&
    Number.isFinite(livePrice) && livePrice !== null
      ? (((livePrice - entry) / entry) * 100).toFixed(1)
      : null;

  const shares =
    Number.isFinite(entry) && Number.isFinite(stop) &&
    entry !== null && stop !== null &&
    entry > stop && riskUsd > 0
      ? Math.floor(riskUsd / (entry - stop))
      : null;

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

        {/* Dist-to-entry line */}
        {distToEntry !== null && (
          <p className="text-[12px] font-mono tabular-nums text-muted">
            price{" "}
            <span className={Number(distToEntry) >= 0 ? "text-pos" : "text-neg"}>
              {Number(distToEntry) >= 0 ? "+" : ""}
              {distToEntry}%
            </span>{" "}
            {Number(distToEntry) >= 0 ? "above" : "below"} entry
          </p>
        )}

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
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!isNaN(v) && v >= 0) setRiskUsd(v);
              }}
              className="w-20 rounded border border-line bg-elevated px-2 py-0.5 font-mono text-[12px] text-foreground tabular-nums focus:outline-none focus:border-accent"
            />
            <span className="font-mono text-[13px] tabular-nums text-foreground ml-2">
              {shares !== null ? `= ${shares} shares` : "—"}
            </span>
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
