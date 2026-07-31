"use client";

import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { GREEK_LABEL } from "@/lib/labels";
import type { GreekKind } from "@/lib/format";

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="w-40 shrink-0 font-mono text-[12px] text-foreground">{term}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

export default function OptionsLearnPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-3 text-[12px] leading-relaxed text-muted">
      <p className="text-muted-2">
        Reference for every number on the{" "}
        <Link href="/options/ladder" className="text-teal hover:underline">
          ladder
        </Link>
        ,{" "}
        <Link href="/options/gamma" className="text-teal hover:underline">
          gamma
        </Link>{" "}
        and{" "}
        <Link href="/options/flow" className="text-teal hover:underline">
          flow
        </Link>{" "}
        pages. Nothing here is advice.
      </p>

      <Panel title="Markers on the ladder">
        <ul className="space-y-1.5">
          <Term term="SPOT / ATM">
            Current underlying price, and the strike nearest it. The ladder centres here on load.
          </Term>
          <Term term="ZG — zero gamma">
            The flip level. Below it dealers are short gamma and hedging{" "}
            <b className="text-foreground">extends</b> moves; above it they are long gamma and moves{" "}
            <b className="text-foreground">pin or dampen</b>.
          </Term>
          <Term term="CW — call wall">
            Heaviest dealer gamma above spot. Acts as resistance and an upside magnet.
          </Term>
          <Term term="PW — put wall">Heaviest dealer gamma below spot. Acts as support.</Term>
          <Term term="MSI">
            Max strike interest — the call and put strikes carrying the heaviest combined
            open-interest and volume concentration. Where the crowd is positioned, which is not
            necessarily where dealers must hedge.
          </Term>
        </ul>
      </Panel>

      <Panel title="Classic ladder columns">
        <p className="mb-2 text-muted-2">
          Daily snapshot from the options chain — puts mirrored on the left, calls on the right.
        </p>
        <ul className="space-y-1.5">
          <Term term="OI / vol">
            Open interest (positions still open) and today&rsquo;s traded volume, per strike. Bars
            scale to the largest value in the visible ladder.
          </Term>
          <Term term="IV">Implied volatility at that strike, annualised.</Term>
          <Term term="GEX">
            Dealer-signed gamma exposure at that strike, in notional dollars per 1% move. Positive
            (green) dampens; negative (red) amplifies.
          </Term>
        </ul>
      </Panel>

      <Panel title="Live ladder columns">
        <p className="mb-2 text-muted-2">
          Streamed from the broker while the live toggle is on — same strikes, quote-level detail.
        </p>
        <ul className="space-y-1.5">
          <Term term="Bid / Ask / Spread%">
            Top of book and the spread as a percentage of the mid. A wide spread is a real cost, not
            a rounding error.
          </Term>
          <Term term="Liq">
            Liquidity flag: the contract has a two-sided quote inside the spread threshold.
          </Term>
          {(["delta", "gamma", "theta", "vega", "rho"] as GreekKind[]).map((k) => (
            <Term key={k} term={`${GREEK_LABEL[k].symbol} ${k}`}>
              {GREEK_LABEL[k].gloss}
            </Term>
          ))}
          <Term term="Fresh %">
            Share of contracts with a non-null quote as of the last poll. Below ~70% the ladder is
            thin — treat the derived levels as directional, not precise.
          </Term>
        </ul>
      </Panel>

      <Panel title="Derived levels">
        <ul className="space-y-1.5">
          <Term term="Max pain">
            The strike where the most option value expires worthless. A gravity story, not a
            forecast.
          </Term>
          <Term term="Pin risk (0–100)">
            How strongly the ladder implies price sticks to a strike into expiry. Above ~70 treat
            breakouts sceptically.
          </Term>
          <Term term="Net GEX band">
            Total dealer gamma bucketed into a regime label rather than a raw number, because the
            raw number is only meaningful relative to this underlying&rsquo;s own history.
          </Term>
          <Term term="Delta bands (50Δ / 25Δ / 16Δ)">
            The strikes trading at those deltas. 50Δ ≈ at the money; 25Δ ≈ the conventional
            &ldquo;one standard deviation-ish&rdquo; wing; 16Δ ≈ the tail the market prices at
            roughly a one-in-six chance of finishing in the money.
          </Term>
          <Term term="DEX profile">
            Cumulative dealer delta across strikes. Where it crosses zero is the level dealers are
            flat; slope tells you how fast their hedge grows as price moves.
          </Term>
          <Term term="MVC">
            Most valuable contract — the ladder&rsquo;s best greek-per-dollar contracts, ranked on
            gamma and delta per dollar of premium, filtered to contracts that are actually liquid.
            It is a screen, not a recommendation.
          </Term>
          <Term term="IV skew">
            Put IV minus call IV at matched deltas. Positive means downside protection is bid;
            negative (call skew) means upside is being chased.
          </Term>
        </ul>
      </Panel>

      <Panel title="Picking a strike">
        <p>
          Start <b className="text-foreground">ATM</b> for delta, then let the walls frame the trade:
          buy toward the wall in your direction (<b className="font-mono text-pos">CW</b> for calls,{" "}
          <b className="font-mono text-neg">PW</b> for puts) as the magnet, and treat the opposite
          wall as where the move likely stalls. Strikes beyond the expected move are low-probability
          lottery tickets — cheap, and usually expire worthless.
        </p>
      </Panel>
    </div>
  );
}
