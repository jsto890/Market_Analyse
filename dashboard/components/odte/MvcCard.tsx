"use client";

import { useState } from "react";
import Panel from "@/components/ui/Panel";
import InfoTip from "@/components/ui/InfoTip";
import { price, greek } from "@/lib/format";
import { rankMvc } from "@/lib/optionsAnalytics";
import type { StrikeLevel } from "@/lib/optionsLive";

const MVC_TIP =
  "Most valuable contract: the ladder ranked on greeks bought per dollar of premium — 60% gamma, 40% delta, discounted by the quoted spread you'd actually cross. Contracts wider than the spread filter are dropped. It is a screen for where convexity is cheap right now, not a recommendation to buy anything.";

export default function MvcCard({
  levels,
  spot,
}: {
  levels: StrikeLevel[];
  spot: number | null;
}) {
  const [liquidOnly, setLiquidOnly] = useState(true);
  const rows = rankMvc(levels, { limit: 6, requireLiquid: liquidOnly });

  return (
    <Panel
      title="Most valuable contracts"
      subtitle="greeks per dollar of premium"
      actions={
        <>
          <label className="flex items-center gap-1 font-mono text-[11px] text-muted">
            <input
              type="checkbox"
              checked={liquidOnly}
              onChange={(e) => setLiquidOnly(e.target.checked)}
              className="accent-[var(--teal)]"
            />
            liquid only
          </label>
          <InfoTip label="How this ranking works" content={MVC_TIP} />
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="font-mono text-[11px] text-muted">
          {levels.length === 0
            ? "no greeks in this snapshot — turn the live ladder on"
            : "nothing clears the spread and liquidity filters right now"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px] tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.06em] text-muted">
                <th className="px-2 py-1 text-left font-normal">contract</th>
                <th className="px-2 py-1 text-right font-normal">mid</th>
                <th className="px-2 py-1 text-right font-normal">Γ/$</th>
                <th className="px-2 py-1 text-right font-normal">Δ/$</th>
                <th className="px-2 py-1 text-right font-normal">Θ/$ per day</th>
                <th className="px-2 py-1 text-left font-normal">why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.side}-${r.strike}`} className="border-t border-line/50">
                  <td className="px-2 py-1">
                    <span className="text-foreground">{r.strike.toFixed(0)}</span>{" "}
                    <span className={r.side === "call" ? "text-pos" : "text-neg"}>
                      {r.side === "call" ? "C" : "P"}
                    </span>
                    {spot != null && (
                      <span className="ml-1 text-[10px] text-muted-2">
                        {r.strike > spot ? "+" : ""}
                        {(((r.strike - spot) / spot) * 100).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right text-foreground">{price(r.mid)}</td>
                  <td className="px-2 py-1 text-right text-teal">{r.gammaPerDollar.toFixed(4)}</td>
                  <td className="px-2 py-1 text-right text-muted">{r.deltaPerDollar.toFixed(3)}</td>
                  <td className="px-2 py-1 text-right text-neg">
                    {r.thetaPerDollar != null ? `${(r.thetaPerDollar * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-2 py-1 text-left text-muted-2">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-2">
        Γ/$ is how much convexity a dollar of premium buys; Θ/$ is the share of that premium the
        position gives back each day if nothing moves. High on both means a fast, expensive clock.
        {rows[0]?.gamma != null && (
          <>
            {" "}
            Top pick raw greeks: {greek(rows[0].gamma, "gamma")} Γ, {greek(rows[0].delta, "delta")} Δ
            {rows[0].vega != null ? `, ${greek(rows[0].vega, "vega")} ν` : ""}.
          </>
        )}
      </p>
    </Panel>
  );
}
