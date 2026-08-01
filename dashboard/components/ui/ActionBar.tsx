"use client";

import Link from "next/link";
import { useState } from "react";
import PinToggle from "@/components/ui/PinToggle";

/**
 * The things you ever do to a ticker, in one place and one order, on every
 * surface that names one. Each card had grown its own subset in its own idiom —
 * a text "Unpin" here, a bordered "Pin" chip there, an Alert link on exactly one
 * page — so which actions a name had depended on where you happened to find it.
 *
 * An action pointing at the surface you are already on is omitted rather than
 * disabled: `actions` is per-context for that reason, not for decoration.
 *
 * Never more than four, and never two rows: a card whose verbs wrap is a card
 * whose verbs outrank its figures. Compare and Copy are ticker-page actions —
 * you compare a name you are already reading, not one you are scanning past.
 */
export type ActionKind = "pin" | "alert" | "options" | "compare" | "copy" | "open";

export const ALL_ACTIONS: ActionKind[] = ["pin", "alert", "options", "open"];

const CHIP =
  "rounded-[5px] border border-line px-2 py-[5px] text-label text-3 transition-colors hover:border-line-strong hover:text-foreground";

/** The one verb that leaves the card, so it carries the accent and the wider
 *  track — everything else on the bar acts in place. */
const OPEN =
  "rounded-[5px] border border-accent/40 bg-accent/10 px-2 py-[5px] text-label font-medium text-accent transition-colors hover:bg-accent/15";

function CopyAction({ symbol, className }: { symbol: string; className: string }) {
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
      className={className}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function ActionBar({
  symbol,
  actions = ALL_ACTIONS,
  optionsHref,
  onOpen,
  fill,
  className,
}: {
  symbol: string;
  /** Which actions this surface offers. Order is fixed by the array you pass. */
  actions?: ActionKind[];
  /** Overrides the options destination. The ticker page carries its own options
   *  block, so there it is an anchor rather than a navigation. */
  optionsHref?: string;
  /** Fires when Open is followed — cards use it to remember where you were. */
  onOpen?: () => void;
  /** Card footer: the verbs share the card's width in one row. Off, they size
   *  to their text and sit inline with whatever else is on the line. */
  fill?: boolean;
  className?: string;
}) {
  const chip = fill ? `${CHIP} flex-1 text-center` : CHIP;
  const open = fill ? `${OPEN} flex-[1.4] text-center` : OPEN;

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      {actions.map((a) => {
        switch (a) {
          case "pin":
            return (
              <PinToggle
                key={a}
                symbol={symbol}
                variant="chip"
                className={fill ? "flex-1 text-center" : undefined}
              />
            );
          case "alert":
            return (
              <Link key={a} href={`/alerts?symbol=${symbol}`} className={chip}>
                Alert
              </Link>
            );
          case "options":
            return (
              <Link key={a} href={optionsHref ?? `/t/${symbol}#options`} className={chip}>
                Options
              </Link>
            );
          case "compare":
            // The screener is the only surface that scores several names side
            // by side, so Compare opens it seeded with this one.
            return (
              <Link key={a} href={`/screener?symbols=${symbol}`} className={chip}>
                Compare
              </Link>
            );
          case "copy":
            return <CopyAction key={a} symbol={symbol} className={chip} />;
          case "open":
            return (
              <Link key={a} href={`/t/${symbol}`} onClick={onOpen} className={open}>
                Open →
              </Link>
            );
        }
      })}
    </div>
  );
}
