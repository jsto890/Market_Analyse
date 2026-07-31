"use client";

import { useMemo } from "react";
import { useLadder, useOdteSymbol } from "@/lib/odte";
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import { densityCount, exposureTotals, withinStrikes } from "@/lib/optionsAnalytics";
import { useOptionsUi } from "@/lib/optionsUi";
import { GREEK_LABEL } from "@/lib/labels";
import { greek } from "@/lib/format";
import type { StrikeLevel } from "@/lib/optionsLive";
import InfoTip from "@/components/ui/InfoTip";
import Panel from "@/components/ui/Panel";
import Page from "@/components/ui/Page";
import Empty from "@/components/ui/Empty";
import Loading from "@/components/ui/Loading";

/** Dollar figures that span six orders of magnitude between a $20 name and SPY,
 * so they are read as a magnitude, not counted. */
function fmtDollars(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "+";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

interface ExposureCard {
  key: string;
  symbol: string;
  name: string;
  value: number;
  unit: string;
  /** What this number says about today's tape, in the direction it is signed. */
  tape: (v: number) => string;
  covered: number;
}

function Card({ card, strikes }: { card: ExposureCard; strikes: number }) {
  const thin = strikes > 0 && card.covered < strikes * 0.7;
  return (
    <div className="rounded-md border border-line bg-elevated p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-title text-model">{card.symbol}</span>
        <span className="text-body text-2">{card.name}</span>
        <InfoTip label={`What ${card.name} means`} content={card.tape(card.value)} />
      </div>
      <p className={`mt-1 text-display ${card.value >= 0 ? "text-pos" : "text-neg"}`}>
        {fmtDollars(card.value)}
      </p>
      <p className="text-body text-muted">{card.unit}</p>
      <p className="mt-2 border-t border-line pt-2 text-body text-2">{card.tape(card.value)}</p>
      {thin && (
        <p className="mt-1 text-body text-warn">
          {card.covered} of {strikes} strikes quoted this greek — read it as a direction, not a
          level.
        </p>
      )}
    </div>
  );
}

export default function OptionsGreeksPage() {
  const [activeSymbol] = useOdteSymbol();
  const { live, density, expiry } = useOptionsUi();
  const count = densityCount(density);

  const { data, isLoading } = useLadder(activeSymbol, 4, 0.5);
  const { ladder: liveLadder, status } = useOptionsLivePoller(activeSymbol, expiry || "0DTE", live);

  const levels = useMemo<StrikeLevel[]>(
    () => withinStrikes(liveLadder?.levels ?? [], liveLadder?.spot ?? null, count),
    [liveLadder, count]
  );
  const spot = liveLadder?.spot ?? data?.spot ?? null;
  const totals = useMemo(() => exposureTotals(levels, spot), [levels, spot]);

  const cards: ExposureCard[] = [
    {
      key: "dex",
      symbol: GREEK_LABEL.delta.symbol,
      name: "Delta exposure",
      value: totals.dex,
      unit: "dollars of underlying dealers are holding",
      covered: totals.covered.dex,
      tape: (v) =>
        v >= 0
          ? "Dealers are net long the underlying against this book — they sell into strength to stay flat."
          : "Dealers are net short the underlying against this book — they buy into strength to stay flat.",
    },
    {
      key: "gex",
      symbol: GREEK_LABEL.gamma.symbol,
      name: "Gamma exposure",
      value: totals.gex,
      unit: "dollars of delta dealers must trade per 1% move",
      covered: totals.covered.gex,
      tape: (v) =>
        v >= 0
          ? "Long gamma: dealer hedging leans against the move, so ranges compress and breakouts fade."
          : "Short gamma: dealer hedging runs with the move, so ranges extend and breaks accelerate.",
    },
    {
      key: "vex",
      symbol: GREEK_LABEL.vega.symbol,
      name: "Vega exposure",
      value: totals.vex,
      unit: "dollars per 1 point of implied volatility",
      covered: totals.covered.vex,
      tape: (v) =>
        v >= 0
          ? "Dealers gain as implied vol rises — a vol spike works for the book, so they have no reason to chase it."
          : "Dealers lose as implied vol rises — a vol spike pressures the book, which is what makes vol expansions self-feeding.",
    },
    {
      key: "tex",
      symbol: GREEK_LABEL.theta.symbol,
      name: "Theta exposure",
      value: totals.tex,
      unit: "dollars of decay accruing to dealers per day",
      covered: totals.covered.tex,
      tape: (v) =>
        v >= 0
          ? "Dealers collect decay: time passing pays the book, so they are content to sit."
          : "Dealers pay decay: time passing costs the book, so they need the move to arrive.",
    },
  ];

  return (
    <Page width="wide">
      {!live && (
        <p className="rounded border border-line bg-elevated px-3 py-2 text-body text-2">
          Aggregate exposure is computed from per-contract greeks, which only the live session
          carries — turn <b className="text-foreground">Data · Live</b> on in the header.
        </p>
      )}

      {live && status === "connecting" && !liveLadder && (
        <Loading variant="block" label="Connecting to live session" />
      )}

      {live && liveLadder && levels.length === 0 && (
        <Empty message="No strikes in this window — widen Strikes on the ladder tab." />
      )}

      {levels.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.key} card={c} strikes={levels.length} />
            ))}
          </div>

          {/* Vanna and charm are the two the desk actually asks for next, and
             neither is derivable from what the feed sends: both are second-order
             partials that need a pricing model over the surface, not a quote.
             Stated rather than approximated. */}
          <p className="text-body text-2">
            Vanna (dΔ/dvol) and charm (dΔ/dtime) are not shown: the feed carries first-order greeks
            per contract, and deriving the cross-partials needs a fitted volatility surface this
            stack does not build.
          </p>

          <Panel
            title="Exposure by strike"
            count={levels.length}
            subtitle={`${activeSymbol} · ${expiry || "0DTE"}`}
            actions={
              <InfoTip
                label="How to read this table"
                content="Per-strike dealer exposure, signed the same way as the cards: calls minus puts, weighted by open interest. The strike carrying the largest gamma is the one hedging flow defends hardest."
              />
            }
            readThis="The strikes with the biggest gamma are where hedging flow concentrates — expect price to stall near them while dealers are long gamma, and to run through them while short."
          >
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-data">
                <thead>
                  <tr className="text-micro uppercase tracking-[0.06em] text-muted">
                    <th
                      scope="col"
                      className="sticky top-0 z-10 border-b border-line bg-elevated px-2 py-1.5 text-left font-normal"
                    >
                      strike
                    </th>
                    {(["delta", "gamma", "vega", "theta"] as const).map((g) => (
                      <th
                        key={`c-${g}`}
                        scope="col"
                        className="sticky top-0 z-10 border-b border-line bg-elevated px-2 py-1.5 text-right font-normal text-call"
                      >
                        <InfoTip label={`What call ${g} means`} content={GREEK_LABEL[g].gloss} className="text-call">
                          {`call ${GREEK_LABEL[g].symbol}`}
                        </InfoTip>
                      </th>
                    ))}
                    {(["delta", "gamma", "vega", "theta"] as const).map((g) => (
                      <th
                        key={`p-${g}`}
                        scope="col"
                        className="sticky top-0 z-10 border-b border-line bg-elevated px-2 py-1.5 text-right font-normal text-put"
                      >
                        <InfoTip label={`What put ${g} means`} content={GREEK_LABEL[g].gloss} className="text-put">
                          {`put ${GREEK_LABEL[g].symbol}`}
                        </InfoTip>
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="sticky top-0 z-10 border-b border-line bg-elevated px-2 py-1.5 text-right font-normal"
                    >
                      net Γ$
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l) => {
                    const netGex =
                      ((l.call.gamma ?? 0) * (l.call.oi ?? 0) - (l.put.gamma ?? 0) * (l.put.oi ?? 0)) *
                      100 *
                      (spot ?? 1) *
                      (spot ?? 1) *
                      0.01;
                    return (
                      <tr key={l.strike} className="[&>td]:border-b [&>td]:border-line/50">
                        <td className="px-2 py-1 font-semibold">{l.strike.toFixed(0)}</td>
                        {(["delta", "gamma", "vega", "theta"] as const).map((g) => (
                          <td key={`c-${g}`} className="px-2 py-1 text-right text-muted">
                            {l.call[g] != null ? greek(l.call[g], g) : "—"}
                          </td>
                        ))}
                        {(["delta", "gamma", "vega", "theta"] as const).map((g) => (
                          <td key={`p-${g}`} className="px-2 py-1 text-right text-muted">
                            {l.put[g] != null ? greek(l.put[g], g) : "—"}
                          </td>
                        ))}
                        <td className={`px-2 py-1 text-right ${netGex >= 0 ? "text-pos" : "text-neg"}`}>
                          {fmtDollars(netGex)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {!live && isLoading && <Loading variant="block" label="Loading snapshot" />}
    </Page>
  );
}
