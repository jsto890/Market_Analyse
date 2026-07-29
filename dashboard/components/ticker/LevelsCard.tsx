"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { useTickerData } from "@/lib/useTickerData";
import type { BridgeRow } from "@/types/bridge";

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
          className="ml-1 cursor-default select-none font-mono text-[11px] leading-none text-muted"
          aria-label="info"
        >
          i
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 max-w-[240px] rounded border border-line bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg"
          sideOffset={4}
        >
          {text}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Horizontal range bar plotting stop / entry / current / target as positions. */
function PriceRail({
  stop,
  entry,
  target,
  price,
}: {
  stop: number;
  entry: number;
  target: number;
  price: number | null;
}) {
  const vals = [stop, entry, target, price].filter((v): v is number => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  return (
    <div className="pt-1">
      <div className="relative h-1.5 rounded-full bg-line">
        <div
          className="absolute h-full rounded-l-full bg-neg/40"
          style={{ left: `${pos(Math.min(stop, entry))}%`, width: `${Math.abs(pos(entry) - pos(stop))}%` }}
        />
        <div
          className="absolute h-full rounded-r-full bg-pos/40"
          style={{ left: `${pos(Math.min(entry, target))}%`, width: `${Math.abs(pos(target) - pos(entry))}%` }}
        />
        {[
          { v: stop, cls: "bg-neg", label: "S" },
          { v: entry, cls: "bg-foreground", label: "E" },
          { v: target, cls: "bg-pos", label: "T" },
        ].map((m) => (
          <div
            key={m.label}
            className={`absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 ${m.cls}`}
            style={{ left: `${pos(m.v)}%` }}
          />
        ))}
        {price != null && (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg"
            style={{ left: `${pos(price)}%` }}
            title={`price ${price.toFixed(2)}`}
          />
        )}
      </div>
    </div>
  );
}

export default function LevelsCard({ ticker, bridgeRow }: LevelsCardProps) {
  const [riskUsd, setRiskUsd] = useLocalStorage("dash:riskUsd", 500);

  const { quote: quoteRes, actionCard: cardRes } = useTickerData(ticker);
  const quote = quoteRes.data;
  // Prefer the live-computed action_card levels; the nightly bridge row often
  // carries degenerate (entry==stop) placeholders. Shares SWR cache w/ WhyPanel.
  const card = cardRes.data;

  const cardOk =
    card != null &&
    card.entry != null &&
    card.stop != null &&
    Number.isFinite(card.entry) &&
    Number.isFinite(card.stop) &&
    card.entry !== card.stop;

  const entry = cardOk ? (card!.entry as number) : bridgeRow.entry;
  const stop = cardOk ? (card!.stop as number) : bridgeRow.stop;
  const target = cardOk ? card!.target ?? bridgeRow.target : bridgeRow.target;
  const stop_anchor = (cardOk ? card!.stop_anchor : null) ?? bridgeRow.stop_anchor;

  const risk_reward =
    (cardOk ? card!.risk_reward : bridgeRow.risk_reward) ??
    (entry != null && stop != null && target != null && entry !== stop
      ? (target - entry) / (entry - stop)
      : null);

  const livePrice = quote?.price ?? null;

  // Levels are only meaningful when entry, stop and target are distinct.
  const valid =
    entry != null &&
    stop != null &&
    target != null &&
    Number.isFinite(entry) &&
    Number.isFinite(stop) &&
    entry !== stop;

  const distToEntry =
    valid && entry !== 0 && livePrice != null
      ? (((livePrice - entry!) / entry!) * 100).toFixed(1)
      : null;

  const shares =
    valid && entry! > stop! && riskUsd > 0 ? Math.floor(riskUsd / (entry! - stop!)) : null;

  const rrLabel = risk_reward != null ? risk_reward.toFixed(2) : "—";
  const anchorLabel = stop_anchor ? stopAnchorLabel(stop_anchor) : null;

  const verdict = (cardOk ? card!.verdict : null) ?? bridgeRow.action_label ?? null;
  const hc = cardOk ? card!.high_conviction === true : false;
  const verdictLong = verdict != null && /LONG|BUY|PRIME|BREAKOUT|STANDARD/i.test(verdict);
  const verdictShort = verdict != null && /SHORT|SELL/i.test(verdict);
  // Fall back to the level structure (target vs entry vs stop) for WATCH-type
  // names that still carry a directional setup.
  const structLong = valid && target! > entry! && entry! > stop!;
  const structShort = valid && target! < entry! && entry! < stop!;
  const isLong = verdictLong || (!verdictShort && structLong);
  const isShort = verdictShort || (!verdictLong && structShort);
  const dir = isLong ? "long" : isShort ? "short" : null;
  // "committed" = the model actually issued the call; otherwise it's a watch-bias.
  const committed = verdictLong || verdictShort;
  const stopPct =
    valid && entry !== 0 ? (((stop! - entry!) / entry!) * 100).toFixed(1) : null;
  const tgtPct =
    valid && entry !== 0 ? (((target! - entry!) / entry!) * 100).toFixed(1) : null;

  return (
    <section className="rounded-md border border-line bg-elevated">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="tick text-[13px] font-semibold text-foreground">Trade levels</span>
        <InfoTooltip text="Entry/stop/target from the live scorer. Context, not a mechanical exit system." />
      </div>

      {!valid ? (
        <div className="px-4 py-4 text-[12px] text-muted">
          No trade levels for {ticker} yet — the scorer needs a directional setup (entry, stop and
          target must differ).
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3">
          {/* Directional trade plan synthesized from the model verdict + levels */}
          <div
            className={`rounded border px-3 py-2 text-[12px] leading-relaxed ${
              dir === "long"
                ? "border-pos/30 bg-pos/[0.06]"
                : dir === "short"
                  ? "border-neg/30 bg-neg/[0.06]"
                  : "border-line bg-raised/40"
            }`}
          >
            {dir ? (
              <>
                <span className={`font-semibold ${dir === "long" ? "text-pos" : "text-neg"}`}>
                  {dir === "long" ? "Long" : "Short"} {committed ? "plan" : "bias"}
                </span>
                {!committed && (
                  <span className="ml-1.5 text-[10px] font-medium uppercase text-muted">watch</span>
                )}
                {hc && <span className="ml-1.5 text-[10px] font-semibold text-warn">HIGH CONV</span>}
                <span className="text-muted">
                  {" — "}
                  {dir === "long" ? "enter near" : "sell near"}{" "}
                  <span className="font-mono text-foreground">{entry!.toFixed(2)}</span>, stop{" "}
                  <span className="font-mono text-neg">{stop!.toFixed(2)}</span>
                  {stopPct != null && ` (${stopPct}%)`}, target{" "}
                  <span className="font-mono text-pos">{target!.toFixed(2)}</span>
                  {tgtPct != null && ` (${Number(tgtPct) >= 0 ? "+" : ""}${tgtPct}%)`} at{" "}
                  <span className="font-mono text-foreground">{rrLabel}</span> R:R. Invalidates on a
                  close {dir === "long" ? "below" : "above"}{" "}
                  <span className="font-mono text-foreground">{stop!.toFixed(2)}</span>.
                </span>
              </>
            ) : (
              <span className="text-muted">
                <span className="font-semibold text-foreground">No directional call</span> — levels
                below are reference only; wait for a cleaner setup.
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Entry</p>
              <p className="font-mono text-[14px] tabular-nums text-foreground">
                {entry!.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Stop</p>
              <p className="font-mono text-[14px] tabular-nums text-neg">{stop!.toFixed(2)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Target</p>
              <p className="font-mono text-[14px] tabular-nums text-pos">{target!.toFixed(2)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">R:R</p>
              <p
                className={`font-mono text-[14px] tabular-nums ${
                  risk_reward != null && risk_reward >= 2
                    ? "text-pos"
                    : risk_reward != null && risk_reward < 1
                      ? "text-warn"
                      : "text-foreground"
                }`}
              >
                {rrLabel}
              </p>
            </div>
          </div>

          <PriceRail stop={stop!} entry={entry!} target={target!} price={livePrice} />

          {distToEntry !== null && (
            <p className="font-mono text-[12px] tabular-nums text-muted">
              price{" "}
              <span className={Number(distToEntry) >= 0 ? "text-pos" : "text-neg"}>
                {Number(distToEntry) >= 0 ? "+" : ""}
                {distToEntry}%
              </span>{" "}
              {Number(distToEntry) >= 0 ? "above" : "below"} entry
            </p>
          )}

          {anchorLabel && <p className="text-[12px] text-muted">{anchorLabel}</p>}

          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="font-mono text-[11px] text-muted">Risk $</label>
              <input
                type="number"
                min={0}
                step={50}
                value={riskUsd}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!isNaN(v) && v >= 0) setRiskUsd(v);
                }}
                className="w-20 rounded border border-line bg-raised px-2 py-0.5 font-mono text-[12px] tabular-nums text-foreground focus:border-accent focus:outline-none"
              />
              {shares !== null ? (
                <span className="font-mono text-[13px] tabular-nums text-foreground">
                  = <span className="text-accent">{shares}</span> shares
                  <span className="ml-2 text-muted">
                    ${(shares * entry!).toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                    notional
                  </span>
                </span>
              ) : (
                <span className="font-mono text-[13px] text-muted">—</span>
              )}
            </div>
          </div>

          <p className="pt-1 text-[10px] leading-snug text-muted">
            Sizing from your risk budget ÷ (entry − stop). Levels are context, not a mechanical exit
            system.
          </p>
        </div>
      )}
    </section>
  );
}
