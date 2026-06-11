"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

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
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`font-mono text-[13px] tabular-nums ${valueClass}`}>{value}</span>
    </span>
  );

  if (!tooltip) return inner;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="cursor-default">{inner}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          {tooltip}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
