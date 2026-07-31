// Status/label pills. Deliberately flat tints (no hover, cursor-default) so
// they read as labels — distinct from actual buttons, which carry solid fills
// and hover states.
//
// Tier, verdict and edge are *model output*, so they render in --model and
// never in P&L green/red. A 0.72 score in green tells the user it is profit;
// the app's own caveat line says magnitude does not predict returns (r≈0).
// Direction is carried by the word ("Long" / "Short"), not by hue.
const TIER: Record<string, string> = {
  PRIME_LONG: "border-model/45 bg-model/[0.20] text-model",
  BREAKOUT_LONG: "border-model/40 bg-model/[0.14] text-model",
  STANDARD_LONG: "border-model/30 bg-model/[0.09] text-model",
  WATCH: "border-line bg-muted/10 text-muted",
  AVOID: "border-line-strong bg-raised text-muted",
  WAIT: "border-line bg-muted/10 text-muted",
};

const VERDICT: Record<string, string> = {
  LONG: "border-model/45 bg-model/[0.16] text-model",
  SHORT: "border-model/45 bg-transparent text-model",
  WAIT: "border-line bg-muted/10 text-muted",
};

// `edge` is the portfolio's model-vs-position read. "CONSIDER SELLING" earns
// --amber because it is an *attention* state, which amber is for; the rest sit
// on --model or muted.
const EDGE: Record<string, string> = {
  "HOLD/ADD": "border-model/40 bg-model/[0.14] text-model",
  "CONSIDER SELLING": "border-warn/45 bg-warn/[0.12] text-warn",
  "CONSIDER COVERING": "border-warn/45 bg-warn/[0.12] text-warn",
  NEUTRAL: "border-line bg-muted/10 text-muted",
  "N/A": "border-line bg-muted/10 text-muted",
  "NO DATA": "border-line bg-muted/10 text-muted",
  ERROR: "border-warn/45 bg-warn/[0.12] text-warn",
};

/** Display copy for the raw enums, applied by default wherever a Badge renders
 *  (TH-02). Mapping here rather than at each call site is what stops
 *  `STANDARD_LONG` reaching the screen: a site that forgets to ask for display
 *  copy gets it anyway. The copy is no wider than the enum, so dense tables pay
 *  nothing for it. */
export const BADGE_LABEL: Record<string, string> = {
  PRIME_LONG: "Prime long",
  BREAKOUT_LONG: "Breakout long",
  STANDARD_LONG: "Standard long",
  WATCH: "Watch",
  AVOID: "Avoid",
  WAIT: "Wait",
  LONG: "Long",
  SHORT: "Short",
};

interface BadgeProps {
  variant: "tier" | "verdict" | "style" | "flag" | "edge";
  value: string;
  /** Overrides the display copy. Defaults to `BADGE_LABEL[value]`, then `value`. */
  label?: string;
}

export default function Badge({ variant, value, label }: BadgeProps) {
  const copy = label ?? BADGE_LABEL[value];
  let cls = "";

  if (variant === "tier") {
    cls = TIER[value] ?? "border-line bg-muted/10 text-muted";
  } else if (variant === "verdict") {
    cls = VERDICT[value] ?? "border-line bg-muted/10 text-muted";
  } else if (variant === "edge") {
    cls = EDGE[value] ?? "border-line bg-muted/10 text-muted";
  } else if (variant === "flag") {
    cls = "border-warn/45 bg-warn/[0.12] text-warn";
  } else {
    cls = "border-line bg-muted/10 text-muted";
  }

  return (
    // The raw enum lives on data-value, not on title=: a native tooltip is
    // mouse-only documentation, which this overhaul bans outright.
    <span
      data-value={value}
      className={`inline-flex cursor-default select-none items-center rounded border px-[7px] py-[3px] font-mono text-micro font-semibold leading-tight tabular-nums ${
        copy ? "normal-case" : ""
      } ${cls}`}
    >
      {copy ?? value}
    </span>
  );
}
