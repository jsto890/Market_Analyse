"use client";

import { useEffect, useState } from "react";

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

type Phase = "pre" | "early" | "mid" | "late" | "closed";

/** US-equity session phase in ET, recomputed each minute so advice tracks the clock. */
function useSessionPhase(): Phase {
  const [phase, setPhase] = useState<Phase>("closed");
  useEffect(() => {
    const compute = (): Phase => {
      const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      const day = et.getDay();
      if (day === 0 || day === 6) return "closed";
      const min = et.getHours() * 60 + et.getMinutes();
      if (min < 570) return "pre"; // before 09:30
      if (min >= 960) return "closed"; // after 16:00
      const frac = (min - 570) / (960 - 570);
      if (frac < 0.33) return "early";
      if (frac < 0.75) return "mid";
      return "late";
    };
    setPhase(compute());
    const id = setInterval(() => setPhase(compute()), 60_000);
    return () => clearInterval(id);
  }, []);
  return phase;
}

const PHASE_LABEL: Record<Phase, string> = {
  pre: "pre-market",
  early: "early session",
  mid: "mid-session",
  late: "final stretch",
  closed: "market closed",
};

const PHASE_NOTE: Record<Phase, string> = {
  pre: "Advice sharpens once the market opens; levels and strikes below update live through the session.",
  early:
    "Early session — theta is slow, so a further-OTM strike is cheap with room to run; give the move time to reach the wall.",
  mid: "Mid-session — balance OTM leverage against decay; tighten toward ATM if the move hasn't started.",
  late: "Final stretch — theta is brutal. Prefer near-ATM/slightly-ITM for delta, take profit fast, and skip far-OTM lottery tickets.",
  closed:
    "Market closed — this is the overnight book. Strikes below refresh live once the session opens.",
};

export default function StrikeGuidance({ spot, zeroGamma, callWall, putWall, atm, emPct }: Props) {
  const phase = useSessionPhase();
  const negGamma = spot != null && zeroGamma != null ? spot < zeroGamma : null;
  const emPts = spot != null && emPct != null ? (spot * emPct) / 100 : null;
  const rangeLo = spot != null && emPts != null ? spot - emPts : null;
  const rangeHi = spot != null && emPts != null ? spot + emPts : null;

  // OTM strikes: step ~40% of the expected move (min 1 strike), earlier sessions
  // reach further OTM, the final stretch pulls back toward ATM.
  const base = atm ?? (spot != null ? Math.round(spot) : null);
  const reach = phase === "early" ? 0.5 : phase === "late" ? 0.25 : 0.4;
  const step = emPts != null ? Math.max(1, Math.round(emPts * reach)) : 1;

  let callOtm = base != null ? base + step : null;
  if (callOtm != null && callWall != null && callWall > base!) callOtm = Math.min(callOtm, callWall);
  let putOtm = base != null ? base - step : null;
  if (putOtm != null && putWall != null && putWall < base!) putOtm = Math.max(putOtm, putWall);

  const live = phase !== "closed" && phase !== "pre";

  return (
    <section className="rounded-md border border-line bg-elevated">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="tick text-body font-semibold text-foreground">Strike guidance</span>
        <span className="text-micro text-muted">levels → what to actually trade</span>
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-micro ${
            live ? "border-teal/50 bg-teal/10 text-teal" : "border-line text-muted"
          }`}
        >
          {live && <span className="h-1.5 w-1.5 rounded-full bg-teal" />}
          {PHASE_LABEL[phase]}
        </span>
      </div>

      <p className="border-t border-line px-4 py-1.5 text-micro text-muted-2">
        Advisory only, not financial advice — context for your own decision, not a signal to execute.
      </p>

      <div className="space-y-3 border-t border-line px-4 py-3 text-dense leading-relaxed">
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
          </span>
          .
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded border border-pos/30 bg-pos/[0.06] px-3 py-2">
            <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-pos">
              If bullish
            </p>
            <ul className="space-y-0.5 text-muted">
              <li>
                Buy the <span className="font-mono text-foreground">{n0(callOtm)}</span> call (OTM) —
                cheap gamma that pays if price runs.
              </li>
              <li>
                Target: <span className="font-mono text-foreground">{n0(callWall)}</span> call wall
                (resistance / magnet). ATM{" "}
                <span className="font-mono text-foreground">{n0(atm)}</span> if you want more delta.
              </li>
              <li>
                Above <span className="font-mono text-foreground">{n0(rangeHi)}</span> is a low-odds
                stretch.
              </li>
            </ul>
          </div>
          <div className="rounded border border-neg/30 bg-neg/[0.06] px-3 py-2">
            <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-neg">
              If bearish
            </p>
            <ul className="space-y-0.5 text-muted">
              <li>
                Buy the <span className="font-mono text-foreground">{n0(putOtm)}</span> put (OTM) —
                cheap gamma that pays if price drops.
              </li>
              <li>
                Target: <span className="font-mono text-foreground">{n0(putWall)}</span> put wall
                (support / magnet). ATM{" "}
                <span className="font-mono text-foreground">{n0(atm)}</span> if you want more delta.
              </li>
              <li>
                Below <span className="font-mono text-foreground">{n0(rangeLo)}</span> is a low-odds
                stretch.
              </li>
            </ul>
          </div>
        </div>

        <p className="text-micro text-muted-2">
          <span className="text-foreground">{PHASE_LABEL[phase]}:</span> {PHASE_NOTE[phase]}
        </p>
      </div>
    </section>
  );
}
