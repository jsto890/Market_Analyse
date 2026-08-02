// Shared verdict contract for the ODTE overview cards (dashboard v3 spec §6):
// one pure derive per card — single seam for logic, language, and tests.

export type VerdictStatus = "good" | "neutral" | "caution";
export interface Verdict {
  status: VerdictStatus;
  sentence: string;
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function deriveLevels(i: {
  spot: number | null;
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  totalGex: number | null;
}): Verdict | null {
  if (!i.spot || !i.zeroGamma) return null;
  const dist = (i.spot / i.zeroGamma - 1) * 100;
  const walls =
    i.callWall && i.putWall ? `; walls ${i.callWall}/${i.putWall}` : "";
  if (Math.abs(dist) < 0.3) {
    return {
      status: "neutral",
      sentence: `Levels: pinned at zero-gamma (${fmtPct(dist)})${walls}`,
    };
  }
  if (dist > 0) {
    return {
      status: "good",
      sentence: `Levels: supportive — spot ${fmtPct(dist)} above zero-gamma${walls}`,
    };
  }
  return {
    status: "caution",
    sentence: `Levels: fragile — spot ${fmtPct(dist)} below zero-gamma, moves extend${walls}`,
  };
}

/** The one place a put/call ratio becomes a tilt. Every surface that words a
 *  ratio — the overview verdict, the flow tiles, the flow-tilt prose — reads
 *  its boundaries from here rather than restating 0.8 / 1.2 locally. */
export type FlowTilt = "call-heavy" | "balanced" | "put-heavy";

export function flowTilt(ratio: number): FlowTilt {
  if (ratio < 0.8) return "call-heavy";
  if (ratio <= 1.2) return "balanced";
  return "put-heavy";
}

const TILT_STATUS: Record<FlowTilt, VerdictStatus> = {
  "call-heavy": "good",
  balanced: "neutral",
  "put-heavy": "caution",
};

export function deriveFlow(i: {
  pcrVol: number | null;
  pcrOi: number | null;
  unusualCount: number;
}): Verdict | null {
  if (i.pcrVol == null) return null;
  const unusual = i.unusualCount > 0 ? `; ${i.unusualCount} unusual prints` : "";
  const tilt = flowTilt(i.pcrVol);
  return {
    status: TILT_STATUS[tilt],
    sentence: `Flow: ${tilt} — P/C vol ${i.pcrVol.toFixed(2)}${unusual}`,
  };
}

export function deriveShape(i: {
  atmPutIv: number | null;
  atmCallIv: number | null;
}): Verdict | null {
  if (!i.atmPutIv || !i.atmCallIv) return null;
  const ratio = i.atmPutIv / i.atmCallIv;
  if (ratio > 1.15) {
    return {
      status: "caution",
      sentence: `Shape: put skew rich (${ratio.toFixed(2)}x) — downside hedging bid`,
    };
  }
  if (ratio < 0.9) {
    return {
      status: "good",
      sentence: `Shape: call skew (${ratio.toFixed(2)}x) — upside being chased`,
    };
  }
  return {
    status: "neutral",
    sentence: `Shape: skew flat (${ratio.toFixed(2)}x)`,
  };
}
