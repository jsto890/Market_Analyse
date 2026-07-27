const TIER: Record<string, string> = {
  PRIME_LONG: "bg-warn/20 text-warn border-warn/50",
  BREAKOUT_LONG: "border-pos/50 text-pos",
  STANDARD_LONG: "border-pos/30 text-pos",
  WATCH: "border-line text-muted",
  AVOID: "border-neg/50 text-neg",
  WAIT: "border-line text-muted",
};

// The tier enum reads as a conviction ranking, but the 2015-2024 OOS backtest shows
// it ranks TRAILING relative strength (Spearman +0.67) and carries no forward
// information (-0.015) -- PRIME_LONG names have already outrun their peers by ~8.9%
// by the time they are labelled. Display them as the states they are so the ladder
// is not misread as expected return. The stored value is unchanged; only the
// rendering differs.
const TIER_DISPLAY: Record<string, string> = {
  PRIME_LONG: "EXTENDED",
  BREAKOUT_LONG: "BREAKOUT",
  STANDARD_LONG: "TRENDING",
  WATCH: "WATCH",
  AVOID: "WEAK",
  WAIT: "WAIT",
};

const TIER_TITLE: Record<string, string> = {
  PRIME_LONG: "PRIME_LONG — strongest trailing relative strength. A state, not a forecast: historically the most extended names, with the weakest forward 20d return.",
  BREAKOUT_LONG: "BREAKOUT_LONG — breakout state.",
  STANDARD_LONG: "STANDARD_LONG — trend intact. Describes current state, not expected return.",
  WATCH: "WATCH — no clear directional state.",
  AVOID: "AVOID — weakest trailing relative strength. Historically the best forward 20d return of any tier; not a short signal.",
  WAIT: "WAIT — insufficient agreement to classify.",
};

const VERDICT: Record<string, string> = {
  LONG: "border-pos/50 text-pos",
  SHORT: "border-neg/50 text-neg",
  WAIT: "border-line text-muted",
};

interface BadgeProps {
  variant: "tier" | "verdict" | "style" | "flag";
  value: string;
}

export default function Badge({ variant, value }: BadgeProps) {
  let cls = "";
  let text = value;
  let title: string | undefined;

  if (variant === "tier") {
    cls = TIER[value] ?? "border-line text-muted";
    text = TIER_DISPLAY[value] ?? value;
    title = TIER_TITLE[value];
  } else if (variant === "verdict") {
    cls = VERDICT[value] ?? "border-line text-muted";
  } else if (variant === "flag") {
    cls = "border-warn/50 text-warn bg-warn/10";
  } else {
    cls = "border-line text-muted";
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-px font-mono text-[11px] tabular-nums leading-tight ${cls}`}
    >
      {text}
    </span>
  );
}
