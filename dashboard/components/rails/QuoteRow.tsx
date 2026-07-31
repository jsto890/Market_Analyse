"use client";

import Link from "next/link";
import { RAIL_LABEL } from "@/lib/rail-quotes";
import Loading from "@/components/ui/Loading";

interface QuoteRowProps {
  symbol: string;
  price: number;
  changePct: number;
  /** True when the pct shows the last completed session (market closed). */
  skeleton?: boolean;
}

/** Format price per spec: forex 4dp, ≥1000 thousands-separated no decimals, others 2dp. */
function formatPrice(symbol: string, price: number): string {
  const isForex =
    symbol.endsWith("=X") ||
    symbol === "EURUSD=X" ||
    symbol === "USDJPY=X" ||
    symbol === "GBPUSD=X" ||
    symbol === "AUDUSD=X";

  if (isForex) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Signed % string e.g. "+0.34%" or "-1.20%" */
function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/** Color class for % change per spec §3.1 — threshold |pct| < 0.05 → flat → muted. */
function pctColor(pct: number): string {
  if (Math.abs(pct) < 0.05) return "text-muted";
  return pct > 0 ? "text-pos" : "text-neg";
}

export function QuoteRow({ symbol, price, changePct, skeleton }: QuoteRowProps) {
  const label = RAIL_LABEL[symbol] ?? symbol;

  if (skeleton) {
    // Spec §8.8 — symbol label stays, price/pct are animated bars
    return (
      <div className="h-[26px] flex items-center px-3 gap-2" aria-hidden="true">
        <span className="eyebrow w-12 flex-shrink-0 leading-none">
          {label}
        </span>
        <div className="flex-1 flex justify-end">
          <Loading variant="lines" count={1} className="w-14" />
        </div>
        <div className="w-16 flex justify-end">
          <Loading variant="lines" count={1} className="w-10" />
        </div>
      </div>
    );
  }

  // VIX special-case (spec §11): level has NO color (text-foreground is correct — just no
  // pos/neg applied to the price). The % change column still colors normally.
  return (
    <Link href={`/t/${symbol}`} className="h-[26px] flex items-center px-3 hover:bg-elevated">
      <span className="eyebrow w-12 flex-shrink-0 leading-none">
        {label}
      </span>
      <span className="flex-1 text-right text-data text-foreground leading-none">
        {formatPrice(symbol, price)}
      </span>
      <span
        className={`w-16 text-right text-data font-medium leading-none ${pctColor(changePct)}`}
      >
        {formatPct(changePct)}
      </span>
    </Link>
  );
}
