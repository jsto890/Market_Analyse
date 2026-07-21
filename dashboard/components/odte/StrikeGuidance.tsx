interface Props {
  spot: number | null;
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  atm: number | null;
  emPct: number | null;
}

const n0 = (v: number | null) => (v == null ? "—" : Math.round(v).toString());
const n2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));

/** Turns the raw levels into plain-language, actionable 0DTE strike advice. */
export default function StrikeGuidance({ spot, zeroGamma, callWall, putWall, atm, emPct }: Props) {
  const negGamma = spot != null && zeroGamma != null ? spot < zeroGamma : null;
  const emPts = spot != null && emPct != null ? (spot * emPct) / 100 : null;
  const rangeLo = spot != null && emPts != null ? spot - emPts : null;
  const rangeHi = spot != null && emPts != null ? spot + emPts : null;

  return (
    <section className="rounded-md border border-line bg-elevated">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="tick text-[13px] font-semibold text-foreground">Strike guidance</span>
        <span className="text-[11px] text-muted">levels → what to actually trade</span>
      </div>

      <div className="space-y-3 border-t border-line px-4 py-3 text-[12px] leading-relaxed">
        {/* Regime + range */}
        <p className="text-muted">
          <span className="text-foreground">Regime:</span> spot{" "}
          <span className="font-mono text-foreground">{n2(spot)}</span>{" "}
          {negGamma == null ? "vs" : negGamma ? "sits below" : "sits above"} zero-gamma{" "}
          <span className="font-mono text-foreground">{n2(zeroGamma)}</span>
          {negGamma != null &&
            (negGamma ? (
              <>
                {" "}
                → <span className="text-warn">negative gamma</span>: dealer hedging{" "}
                <span className="text-foreground">amplifies</span> moves (trend-friendly, wider
                stops).
              </>
            ) : (
              <>
                {" "}
                → <span className="text-teal">positive gamma</span>: dealer hedging{" "}
                <span className="text-foreground">dampens</span> moves (pinning / mean-revert).
              </>
            ))}
        </p>
        <p className="text-muted">
          <span className="text-foreground">Expected range today</span> (±
          {emPct == null ? "—" : emPct.toFixed(2)}%):{" "}
          <span className="font-mono text-foreground">
            {n0(rangeLo)}–{n0(rangeHi)}
          </span>{" "}
          — strikes outside this are lower-probability for a single 0DTE session.
        </p>

        {/* Directional playbooks */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded border border-pos/30 bg-pos/[0.06] px-3 py-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-pos">
              If bullish
            </p>
            <ul className="space-y-0.5 text-muted">
              <li>
                Buy the <span className="font-mono text-foreground">{n0(atm)}</span> call (ATM) for
                delta.
              </li>
              <li>
                Upside magnet / cap: <span className="font-mono text-foreground">{n0(callWall)}</span>{" "}
                call wall — resistance where dealer selling builds.
              </li>
              <li>
                Above <span className="font-mono text-foreground">{n0(rangeHi)}</span> is a low-odds
                stretch.
              </li>
            </ul>
          </div>
          <div className="rounded border border-neg/30 bg-neg/[0.06] px-3 py-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neg">
              If bearish
            </p>
            <ul className="space-y-0.5 text-muted">
              <li>
                Buy the <span className="font-mono text-foreground">{n0(atm)}</span> put (ATM) for
                delta.
              </li>
              <li>
                Downside support: <span className="font-mono text-foreground">{n0(putWall)}</span> put
                wall — where dealer buying builds.
              </li>
              <li>
                Below <span className="font-mono text-foreground">{n0(rangeLo)}</span> is a low-odds
                stretch.
              </li>
            </ul>
          </div>
        </div>

        <p className="text-[11px] text-muted/80">
          0DTE theta decays fast and these are <span className="text-foreground">levels, not
          signals</span> — size small, take profit quickly, and don&apos;t chase past the expected
          range.
        </p>
      </div>
    </section>
  );
}
