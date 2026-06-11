const TIER: Record<string, string> = {
  PRIME_LONG: "bg-warn/20 text-warn border-warn/50",
  BREAKOUT_LONG: "border-pos/50 text-pos",
  STANDARD_LONG: "border-pos/30 text-pos",
  WATCH: "border-line text-muted",
  AVOID: "border-neg/50 text-neg",
  WAIT: "border-line text-muted",
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

  if (variant === "tier") {
    cls = TIER[value] ?? "border-line text-muted";
  } else if (variant === "verdict") {
    cls = VERDICT[value] ?? "border-line text-muted";
  } else if (variant === "flag") {
    cls = "border-warn/50 text-warn bg-warn/10";
  } else {
    cls = "border-line text-muted";
  }

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-px font-mono text-[11px] tabular-nums leading-tight ${cls}`}
    >
      {value}
    </span>
  );
}
