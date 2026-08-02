"use client";

import InfoTip from "./InfoTip";

interface StatChipProps {
  label: string;
  value: string | number;
  tone?: "pos" | "neg" | "warn" | "muted";
  tooltip?: string;
  /** Makes the chip a filter: a count you can also act on, rather than a
   *  read-out sitting next to controls that do the same thing. */
  onClick?: () => void;
  pressed?: boolean;
  /** Box skin. `lead` lifts the one chip a summary row is actually about;
   *  `warn` is for a count that is a deadline, not a statistic. */
  variant?: "default" | "lead" | "warn";
}

const TONE_CLASS: Record<string, string> = {
  pos: "text-pos",
  neg: "text-neg",
  warn: "text-warn",
  muted: "text-muted",
};

const VARIANT_CLASS: Record<string, string> = {
  default: "border-line bg-surface",
  lead: "border-line-strong bg-elevated",
  warn: "border-warn/40 bg-warn/10",
};

export default function StatChip({
  label,
  value,
  tone,
  tooltip,
  onClick,
  pressed,
  variant = "default",
}: StatChipProps) {
  const valueClass = tone ? TONE_CLASS[tone] : "text-foreground";
  const box = `inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
    pressed ? "border-accent bg-accent/10" : VARIANT_CLASS[variant]
  }`;
  const body = (
    <>
      <span className="text-label text-muted">{label}</span>
      <span className={`text-data ${valueClass}`}>{value}</span>
    </>
  );

  const inner = onClick ? (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={`${box} hover:border-line-strong`}>
      {body}
    </button>
  ) : (
    <span className={box}>{body}</span>
  );

  if (!tooltip) return inner;

  return (
    <InfoTip content={tooltip} label={`${label}: ${value}`}>
      {inner}
    </InfoTip>
  );
}
