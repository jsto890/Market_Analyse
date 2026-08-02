import { WARN_SURFACE, fmtLevel } from "@/components/odte/gammaFormat";

export interface GammaScenarioCardProps {
  spot: number;
  zeroGamma: number;
  callWall: number | null;
  putWall: number | null;
}

/** What the other side of the flip looks like, written before it happens —
 *  the sentence you want already on the screen when the level goes. */
export default function GammaScenarioCard({
  spot,
  zeroGamma,
  callWall,
  putWall,
}: GammaScenarioCardProps) {
  const above = spot >= zeroGamma;
  const flip = fmtLevel(zeroGamma);

  return (
    <section className={`rounded-[8px] border px-[14px] py-3 ${WARN_SURFACE}`}>
      <div className="eyebrow mb-1.5 text-warn">
        If spot {above ? "breaks" : "reclaims"} {flip}
      </div>
      <p className="m-0 text-body text-2">
        {above ? (
          <>
            Regime inverts to short gamma. Expect the range to expand rather than compress and
            stops to run further than they should
            {putWall != null ? (
              <>
                , and the {fmtLevel(putWall)} put wall to act as an accelerant instead of support
                once it goes
              </>
            ) : null}
            .
          </>
        ) : (
          <>
            Regime inverts to long gamma. Expect the range to compress rather than expand and moves
            to fade instead of extend
            {callWall != null ? (
              <>
                , with the {fmtLevel(callWall)} call wall capping the session instead of
                accelerating through it
              </>
            ) : null}
            .
          </>
        )}
      </p>
    </section>
  );
}
