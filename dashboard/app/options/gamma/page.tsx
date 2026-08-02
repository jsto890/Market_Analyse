"use client";

import { useMemo } from "react";
import { useLadder, useOdteSymbol } from "@/lib/odte";
import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
import { deltaSkew, densityCount, withinStrikes } from "@/lib/optionsAnalytics";
import { useOptionsUi } from "@/lib/optionsUi";
import { deriveLevels } from "@/lib/odte-verdicts";
import DexChart from "@/components/odte/DexChart";
import SkewCard from "@/components/odte/SkewCard";
import DeltaBandsCard from "@/components/odte/DeltaBandsCard";
import MvcCard from "@/components/odte/MvcCard";
import GammaRegimeHero from "@/components/odte/GammaRegimeHero";
import GexProfile from "@/components/odte/GexProfile";
import GammaLevelsCard from "@/components/odte/GammaLevelsCard";
import GexByExpiryCard from "@/components/odte/GexByExpiryCard";
import GammaScenarioCard from "@/components/odte/GammaScenarioCard";
import { fmtExpiryLabel } from "@/components/odte/gammaFormat";
import Page from "@/components/ui/Page";

/** Strikes either side of spot in the profile — 15 rows, as designed. */
const PROFILE_HALF = 7;

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
  const zeroGamma = liveLadder?.zero_gamma_strike ?? data?.levels?.zero_gamma ?? null;
  const callWall = liveLadder?.call_wall_strike ?? data?.levels?.call_wall ?? null;
  const putWall = liveLadder?.put_wall_strike ?? data?.levels?.put_wall ?? null;
  const totalGex = data?.levels?.total_gex ?? null;

  const regime = deriveLevels({ spot, zeroGamma, callWall, putWall, totalGex });

  // Skew reads from whichever source has implied vols — the daily ladder carries
  // IV per strike even when the live session is off; greeks do not.
  const skewRows = levels.length > 0 ? levels : classicRows;
  const rr25 = levels.length > 0 ? deltaSkew(levels) : null;

  const profileRows = useMemo(() => {
    const src =
      levels.length > 0
        ? levels.map((l) => ({
            strike: l.strike,
            gex: (l.call_gex_by_strike ?? 0) + (l.put_gex_by_strike ?? 0),
          }))
        : classicRows.map((r) => ({ strike: r.strike, gex: r.gex }));
    return withinStrikes(src, spot, PROFILE_HALF).sort((a, b) => a.strike - b.strike);
  }, [levels, classicRows, spot]);

  const profileExpiry =
    (levels.length > 0 ? liveLadder?.expiry : data?.expiries?.[idx]?.expiry) ?? null;

  const expiryRows = useMemo(
    () =>
      (data?.expiries ?? []).map((e) => ({
        label: e.expiry === data?.snap_date ? "0DTE" : fmtExpiryLabel(e.expiry),
        net: e.rows.reduce((sum, r) => sum + (r.gex ?? 0), 0),
      })),
    [data]
  );

  return (
    <Page width="wide">
      {!live && (
        <p className="rounded border border-line bg-elevated px-3 py-2 text-body text-2">
          Delta bands, the DEX profile and the contract ranking need per-contract greeks — turn{" "}
          <b className="text-foreground">Live ladder</b> on in the header. Gamma and skew below are
          from today&apos;s snapshot.
        </p>
      )}

      {regime && spot != null && zeroGamma != null && (
        <GammaRegimeHero
          verdict={regime}
          spot={spot}
          zeroGamma={zeroGamma}
          callWall={callWall}
          putWall={putWall}
          totalGex={totalGex}
          pinRisk={liveLadder?.pin_risk ?? null}
        />
      )}

      <div className="grid gap-[16px] xl:grid-cols-[1fr_372px]">
        <GexProfile
          rows={profileRows}
          spot={spot}
          zeroGamma={zeroGamma}
          callWall={callWall}
          putWall={putWall}
          expiry={profileExpiry}
        />
        <div className="flex flex-col gap-[12px]">
          <GammaLevelsCard
            zeroGamma={zeroGamma}
            callWall={callWall}
            putWall={putWall}
            maxPain={liveLadder?.max_pain ?? null}
          />
          <GexByExpiryCard rows={expiryRows} />
          {spot != null && zeroGamma != null && (
            <GammaScenarioCard
              spot={spot}
              zeroGamma={zeroGamma}
              callWall={callWall}
              putWall={putWall}
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DexChart levels={levels} spot={spot} />
        <SkewCard rows={skewRows} spot={spot} deltaSkew25={rr25} />
        <DeltaBandsCard levels={levels} />
        <MvcCard levels={levels} spot={spot} />
      </div>
    </Page>
  );
}
