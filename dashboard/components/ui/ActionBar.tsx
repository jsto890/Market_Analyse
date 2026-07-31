"use client";

import Link from "next/link";
import { useState } from "react";
import PinToggle from "@/components/ui/PinToggle";

/**
 * The five things you ever do to a ticker, in one place and one order, on every
 * surface that names one. Each card had grown its own subset in its own idiom —
 * a text "Unpin" here, a bordered "Pin" chip there, an Alert link on exactly one
 * page — so which actions a name had depended on where you happened to find it.
 *
 * An action pointing at the surface you are already on is omitted rather than
 * disabled: `actions` is per-context for that reason, not for decoration.
 */
export type ActionKind = "pin" | "alert" | "options" | "compare" | "copy";

export const ALL_ACTIONS: ActionKind[] = ["pin", "alert", "options", "compare", "copy"];

const CHIP =
  "rounded border border-line px-1.5 py-0.5 text-micro text-muted transition-colors hover:border-line-strong hover:text-foreground";

function CopyAction({ symbol }: { symbol: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${symbol}`}
      onClick={() => {
        navigator.clipboard?.writeText(symbol).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          },
          () => {}
        );
      }}
      className={CHIP}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function ActionBar({
  symbol,
  actions = ALL_ACTIONS,
  optionsHref,
  className,
}: {
  symbol: string;
  /** Which actions this surface offers. Order is fixed by the array you pass. */
  actions?: ActionKind[];
  /** Overrides the options destination. The ticker page carries its own options
   *  block, so there it is an anchor rather than a navigation. */
  optionsHref?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      {actions.map((a) => {
        switch (a) {
          case "pin":
            return <PinToggle key={a} symbol={symbol} variant="chip" />;
          case "alert":
            return (
              <Link key={a} href={`/alerts?symbol=${symbol}`} className={CHIP}>
                Alert
              </Link>
            );
          case "options":
            return (
              <Link key={a} href={optionsHref ?? `/t/${symbol}#options`} className={CHIP}>
                Options
              </Link>
            );
          case "compare":
            // The screener is the only surface that scores several names side
            // by side, so Compare opens it seeded with this one.
            return (
              <Link key={a} href={`/screener?symbols=${symbol}`} className={CHIP}>
                Compare
              </Link>
            );
          case "copy":
            return <CopyAction key={a} symbol={symbol} />;
        }
      })}
    </div>
  );
}
