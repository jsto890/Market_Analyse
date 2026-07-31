"use client";

import Empty from "@/components/ui/Empty";
import InfoTip from "@/components/ui/InfoTip";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { useTickerData } from "@/lib/useTickerData";
import { deriveLevels } from "@/lib/levels";
import { STATIC_KEYS } from "@/lib/storageKeys";
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
  const priceLeft = price != null ? Math.min(96, Math.max(4, pos(price))) : null;
  return (
    <div className="pt-4" data-testid="price-rail">
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
        {price != null && priceLeft != null && (
          <>
            <span
              className="absolute -top-4 -translate-x-1/2 whitespace-nowrap text-micro tabular-nums text-accent"
              style={{ left: `${priceLeft}%` }}
            >
              {price.toFixed(2)}
            </span>
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg"
              style={{ left: `${priceLeft}%` }}
            />
          </>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-micro tabular-nums text-muted">
        <span>{lo.toFixed(2)}</span>
        <span>{hi.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function LevelsCard({ ticker, bridgeRow }: LevelsCardProps) {
  const [accountSize, setAccountSize] = useLocalStorage(STATIC_KEYS.riskAccountSize, 10000);
  const [riskPct, setRiskPct] = useLocalStorage(STATIC_KEYS.riskPct, 1);
  const riskUsd = accountSize > 0 && riskPct > 0 ? accountSize * (riskPct / 100) : 0;

  const { quote: quoteRes, actionCard: cardRes } = useTickerData(ticker);
  const quote = quoteRes.data;
  // Prefer the live-computed action_card levels; the nightly bridge row often
  // carries degenerate (entry==stop) placeholders. Shares SWR cache w/ WhyPanel.
  const card = cardRes.data;

  const { entry, stop, target, stop_anchor, risk_reward, source } = deriveLevels(bridgeRow, card);

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

  const verdict = (source === "live" ? card!.verdict : null) ?? bridgeRow.action_label ?? null;
  const hc = source === "live" ? card!.high_conviction === true : false;
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
        <span className="tick text-title text-foreground">Trade levels</span>
        <InfoTip content="Entry, stop and target from the live scorer. Context, not a mechanical exit system." label="How these levels are set" />
      </div>

      {!valid ? (
        <Empty
          title="No trade levels"
          message={`The scorer has not issued a directional setup for ${ticker}. Entry, stop and target have to differ before levels mean anything.`}
        />
      ) : (
        <div className="space-y-3 px-4 py-3">
          {/* Directional trade plan synthesized from the model verdict + levels */}
          <div
            className={`rounded border px-3 py-2 text-body leading-relaxed ${
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
                  <span className="ml-1.5 text-micro text-muted">watch</span>
                )}
                {hc && <span className="ml-1.5 text-micro text-warn">HIGH CONV</span>}
                <span className="text-muted">
                  {" — "}
                  {dir === "long" ? "enter near" : "sell near"}{" "}
                  <span className="text-data text-foreground">{entry!.toFixed(2)}</span>, stop{" "}
                  <span className="text-data text-neg">{stop!.toFixed(2)}</span>
                  {stopPct != null && ` (${stopPct}%)`}, target{" "}
                  <span className="text-data text-pos">{target!.toFixed(2)}</span>
                  {tgtPct != null && ` (${Number(tgtPct) >= 0 ? "+" : ""}${tgtPct}%)`} at{" "}
                  <span className="text-data text-foreground">{rrLabel}</span> R:R. Invalidates on a
                  close {dir === "long" ? "below" : "above"}{" "}
                  <span className="text-data text-foreground">{stop!.toFixed(2)}</span>.
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
              <p className="mb-0.5 text-micro text-muted">Entry</p>
              <p className="text-data text-foreground">{entry!.toFixed(2)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-micro text-muted">Stop</p>
              <p className="text-data text-neg">{stop!.toFixed(2)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-micro text-muted">Target</p>
              <p className="text-data text-pos">{target!.toFixed(2)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-micro text-muted">R:R</p>
              <p
                className={`text-data ${
                  risk_reward != null && risk_reward >= 2
                    ? "text-model"
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
            <p className="text-data text-muted">
              price{" "}
              <span className={Number(distToEntry) >= 0 ? "text-pos" : "text-neg"}>
                {Number(distToEntry) >= 0 ? "+" : ""}
                {distToEntry}%
              </span>{" "}
              {Number(distToEntry) >= 0 ? "above" : "below"} entry
            </p>
          )}

          {anchorLabel && <p className="text-body text-muted">{anchorLabel}</p>}

          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-data text-muted" htmlFor="risk-account">
                Account $
              </label>
              <input
                id="risk-account"
                type="number"
                min={0}
                step={1000}
                value={accountSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v >= 0) setAccountSize(v);
                }}
                className="w-24 rounded border border-line bg-raised px-2 py-0.5 text-data text-foreground focus:border-accent focus:outline-none"
              />
              <label className="text-data text-muted" htmlFor="risk-pct">
                Risk %
              </label>
              <input
                id="risk-pct"
                type="number"
                min={0}
                max={100}
                step={0.25}
                value={riskPct}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v >= 0) setRiskPct(v);
                }}
                className="w-16 rounded border border-line bg-raised px-2 py-0.5 text-data text-foreground focus:border-accent focus:outline-none"
              />
            </div>
            {shares !== null ? (
              <p className="text-data text-foreground">
                = <span className="text-accent">{shares}</span> shares (risking{" "}
                ${riskUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} = {riskPct}% $
                {accountSize.toLocaleString(undefined, { maximumFractionDigits: 0 })} account)
              </p>
            ) : (
              <span className="text-data text-muted">—</span>
            )}
            <p className="text-body leading-snug text-muted">
              No fees or slippage modeled. Levels are context, not a mechanical exit system.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
