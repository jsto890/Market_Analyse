"use client";

import { useMemo } from "react";
import { useLadder, useOdteSymbol } from "@/lib/odte";
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import { deltaSkew, densityCount, withinStrikes } from "@/lib/optionsAnalytics";
import { useOptionsUi } from "@/lib/optionsUi";
import GexChart from "@/components/GexChart";
import GexCard from "@/components/odte/GexCard";
import DexChart from "@/components/odte/DexChart";
import SkewCard from "@/components/odte/SkewCard";
import DeltaBandsCard from "@/components/odte/DeltaBandsCard";
import MvcCard from "@/components/odte/MvcCard";
import Page from "@/components/ui/Page";

export default function OptionsGammaPage() {
  const [activeSymbol] = useOdteSymbol();
  const { live, density, expiry } = useOptionsUi();
  const count = densityCount(density);

  const { data } = useLadder(activeSymbol, 4, 0.5);
  const { ladder: liveLadder } = useOptionsLivePoller(activeSymbol, expiry || "0DTE", live);

  const idx = Math.max(0, (data?.expiries ?? []).findIndex((e) => e.expiry === expiry));
  const classicRows = useMemo(
    () => withinStrikes(data?.expiries?.[idx]?.rows ?? [], data?.spot ?? null, count),
    [data, idx, count]
  );
  const levels = useMemo(
    () => withinStrikes(liveLadder?.levels ?? [], liveLadder?.spot ?? null, count),
    [liveLadder, count]
  );

  const spot = liveLadder?.spot ?? data?.spot ?? null;

  // Skew reads from whichever source has implied vols — the daily ladder carries
  // IV per strike even when the live session is off; greeks do not.
  const skewRows = levels.length > 0 ? levels : classicRows;
  const rr25 = levels.length > 0 ? deltaSkew(levels) : null;

  return (
    <Page width="wide">
      {!live && (
        <p className="rounded border border-line bg-elevated px-3 py-2 text-body text-2">
          Delta bands, the DEX profile and the contract ranking need per-contract greeks — turn{" "}
          <b className="text-foreground">Live ladder</b> on in the header. Gamma and skew below are
          from today&apos;s snapshot.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <GexChart
          data={
            levels.length > 0
              ? levels.map((l) => ({
                  strike: l.strike,
                  gex: (l.call_gex_by_strike ?? 0) + (l.put_gex_by_strike ?? 0),
                }))
              : classicRows.map((r) => ({ strike: r.strike, gex: r.gex }))
          }
          spotStrike={spot}
          zeroGammaStrike={liveLadder?.zero_gamma_strike ?? data?.levels?.zero_gamma ?? null}
        />
        <DexChart levels={levels} spot={spot} />
        <SkewCard rows={skewRows} spot={spot} deltaSkew25={rr25} />
        <DeltaBandsCard levels={levels} />
        <MvcCard levels={levels} spot={spot} />
        <GexCard symbol={activeSymbol} />
      </div>
    </Page>
  );
}
