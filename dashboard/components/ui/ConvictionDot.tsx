"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

interface ConvictionDotProps {
  value: "high" | "med" | "low" | null;
}

const TOOLTIP_TEXT = "Display-only — not blended into the composite score";

function Dots({ value }: { value: "high" | "med" | "low" }) {
  return (
    <span className="inline-flex items-center gap-[3px]">
      <span
        className={`block h-2 w-2 rounded-full ${value === "high" || value === "med" || value === "low" ? "bg-muted" : "border border-muted"}`}
        style={{ opacity: value === "high" || value === "med" || value === "low" ? 1 : 0.3 }}
      />
      <span
        className={`block h-2 w-2 rounded-full`}
        style={{
          background: value === "high" || value === "med" ? "var(--muted)" : "transparent",
          border: value === "low" ? "1px solid var(--muted)" : "none",
          opacity: value === "high" || value === "med" ? 1 : 0.3,
        }}
      />
      <span
        className={`block h-2 w-2 rounded-full`}
        style={{
          background: value === "high" ? "var(--muted)" : "transparent",
          border: value !== "high" ? "1px solid var(--muted)" : "none",
          opacity: value === "high" ? 1 : 0.3,
        }}
      />
    </span>
  );
}

export default function ConvictionDot({ value }: ConvictionDotProps) {
  if (value === null) {
    return <span className="font-mono text-[13px] text-muted tabular-nums">—</span>;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex cursor-default">
          <Dots value={value} />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
          sideOffset={4}
        >
          {TOOLTIP_TEXT}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
