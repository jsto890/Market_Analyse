"use client";

import InfoTip from "./InfoTip";

interface StatChipProps {
  label: string;
  value: string | number;
  tone?: "pos" | "neg" | "warn" | "muted";
  tooltip?: string;
}

const TONE_CLASS: Record<string, string> = {
  pos: "text-pos",
  neg: "text-neg",
  warn: "text-warn",
  muted: "text-muted",
};

export default function StatChip({ label, value, tone, tooltip }: StatChipProps) {
  const valueClass = tone ? TONE_CLASS[tone] : "text-foreground";

  const inner = (
    <span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5">
      <span className="text-micro text-muted">{label}</span>
      <span className={`font-mono text-body tabular-nums ${valueClass}`}>{value}</span>
    </span>
  );

  if (!tooltip) return inner;

  return (
    <InfoTip content={tooltip} label={`${label}: ${value}`}>
      {inner}
    </InfoTip>
  );
}
