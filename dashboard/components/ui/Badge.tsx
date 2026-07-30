// Status/label pills. Deliberately flat filled tints (no border, no hover,
// cursor-default) so they read as labels — distinct from actual buttons, which
// carry borders/solid fills + hover states.
const TIER: Record<string, string> = {
  PRIME_LONG: "bg-pos/25 text-pos",
  BREAKOUT_LONG: "bg-pos/15 text-pos",
  STANDARD_LONG: "bg-pos/12 text-pos",
  WATCH: "bg-muted/15 text-muted",
  AVOID: "bg-neg/15 text-neg",
  WAIT: "bg-muted/15 text-muted",
};

const VERDICT: Record<string, string> = {
  LONG: "bg-pos/15 text-pos",
  SHORT: "bg-neg/15 text-neg",
  WAIT: "bg-muted/15 text-muted",
};

const EDGE: Record<string, string> = {
  "HOLD/ADD": "bg-pos/15 text-pos",
  "CONSIDER SELLING": "bg-warn/20 text-warn",
  "CONSIDER COVERING": "bg-warn/20 text-warn",
  NEUTRAL: "bg-muted/15 text-muted",
  "N/A": "bg-muted/15 text-muted",
  "NO DATA": "bg-muted/15 text-muted",
  ERROR: "bg-neg/15 text-neg",
};

interface BadgeProps {
  variant: "tier" | "verdict" | "style" | "flag" | "edge";
  value: string;
}

export default function Badge({ variant, value }: BadgeProps) {
  let cls = "";

  if (variant === "tier") {
    cls = TIER[value] ?? "bg-muted/15 text-muted";
  } else if (variant === "verdict") {
    cls = VERDICT[value] ?? "bg-muted/15 text-muted";
  } else if (variant === "edge") {
    cls = EDGE[value] ?? "bg-muted/15 text-muted";
  } else if (variant === "flag") {
    cls = "bg-warn/15 text-warn";
  } else {
    cls = "bg-muted/15 text-muted";
  }

  return (
    <span
      className={`inline-flex cursor-default select-none items-center rounded px-1.5 py-px font-mono text-[11px] tabular-nums leading-tight ${cls}`}
    >
      {value}
    </span>
  );
}
