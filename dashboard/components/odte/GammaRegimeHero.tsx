import { fmtGex } from "@/lib/odteCompanion";
import type { Verdict } from "@/lib/odte-verdicts";
import { FLIP_SCALE, fmtLevel } from "@/components/odte/gammaFormat";

/** The regime word is a rendering of `deriveLevels()`, not a second derivation:
 *  the library decides the state, this decides how it is said and coloured. */
const REGIME: Record<Verdict["status"], { word: string; sub: string; tone: string }> = {
  good: { word: "Long gamma", sub: "Dealers dampen moves", tone: "text-teal" },
  caution: { word: "Short gamma", sub: "Dealers amplify moves", tone: "text-put" },
  neutral: { word: "At the flip", sub: "Spot is sitting on the sign change", tone: "text-warn" },
};

export interface GammaRegimeHeroProps {
  verdict: Verdict;
  spot: number;
  zeroGamma: number;
  callWall: number | null;
  putWall: number | null;
  totalGex: number | null;
  /** 0–100. Live ladder only — absent on the daily snapshot. */
  pinRisk: number | null;
}

export default function GammaRegimeHero({
  verdict,
  spot,
  zeroGamma,
  callWall,
  putWall,
  totalGex,
  pinRisk,
}: GammaRegimeHeroProps) {
  const regime = REGIME[verdict.status];
  const gap = spot - zeroGamma;
  const pct = (spot / zeroGamma - 1) * 100;
  const above = gap >= 0;

  // The scale spans far enough to hold spot and both walls, so the markers keep
  // their proportions instead of pinning to an arbitrary window.
  const span =
    Math.max(
      Math.abs(gap),
      callWall != null ? Math.abs(callWall - zeroGamma) : 0,
      putWall != null ? Math.abs(putWall - zeroGamma) : 0
    ) * 1.25;
  const spotPct = span > 0 ? Math.min(92, Math.max(8, 50 + (gap / span) * 50)) : 50;

  const hasGexColumn = totalGex != null || pinRisk != null;

  return (
    <section
      className={`grid gap-[22px] rounded-[8px] border border-line-strong bg-elevated p-[18px_20px] lg:items-center ${
        hasGexColumn
          ? "lg:grid-cols-[300px_1px_1fr_1px_260px]"
          : "lg:grid-cols-[300px_1px_1fr]"
      }`}
    >
      <div>
        <div className="eyebrow mb-[7px]">Regime now</div>
        <div className={`text-display font-sans tracking-[-0.01em] ${regime.tone}`}>
          {regime.word}
        </div>
        <p className="m-0 mt-[5px] text-body text-3">{regime.sub}</p>
      </div>

      <div className="hidden bg-line lg:block lg:self-stretch" />

      <div>
        <div className="eyebrow mb-2">Spot vs the flip</div>
        <div className="relative h-[46px]">
          <span
            className="absolute top-0 whitespace-nowrap text-data text-foreground"
            style={{ left: `${spotPct}%`, transform: "translateX(-50%)" }}
          >
            spot {spot.toFixed(2)}
          </span>
          <div className={`absolute inset-x-0 top-[22px] h-1 rounded-[2px] ${FLIP_SCALE}`} />
          <span className="absolute top-[17px] h-[14px] w-[2px] bg-teal" style={{ left: "50%" }} />
          <span
            className="absolute top-[15px] h-[18px] w-[2px] bg-foreground"
            style={{ left: `${spotPct}%` }}
          />
          <span className="absolute left-1/2 top-[31px] -translate-x-1/2 whitespace-nowrap text-data text-teal">
            zero-γ {fmtLevel(zeroGamma)}
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="whitespace-nowrap">
            <span className="eyebrow">Short gamma</span>
            <span className="text-label text-muted"> · moves extend</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="eyebrow">Long gamma</span>
            <span className="text-label text-muted"> · moves pin</span>
          </span>
        </div>
        <p className="m-0 mt-2 text-body text-3">
          Spot sits{" "}
          <b className="font-semibold text-2">
            {above ? "+" : "−"}
            {Math.abs(pct).toFixed(2)}%
          </b>{" "}
          {above ? "above" : "below"} the flip — {Math.abs(gap).toFixed(2)} points{" "}
          {above ? "of cushion" : "under it"}. {above ? "Below" : "Above"}{" "}
          {fmtLevel(zeroGamma)} the sign inverts and the same hedging flow starts{" "}
          {above ? "amplifying instead of absorbing" : "absorbing instead of amplifying"}.
        </p>
      </div>

      {hasGexColumn && (
        <>
          <div className="hidden bg-line lg:block lg:self-stretch" />
          <div>
            {totalGex != null && (
              <>
                <div className="eyebrow mb-[7px]">Net GEX</div>
                <div className="text-data text-foreground">{fmtGex(totalGex)}</div>
              </>
            )}
            {pinRisk != null && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-label text-muted">pin risk</span>
                <span className="relative h-[5px] flex-1 overflow-hidden rounded-[3px] bg-raised">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[2px] bg-teal"
                    style={{ width: `${Math.min(100, Math.max(0, pinRisk))}%` }}
                  />
                </span>
                <span className="text-data text-foreground">{pinRisk.toFixed(0)}</span>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
