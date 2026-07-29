"use client";

import InfoTip from "./InfoTip";

interface ConvictionDotProps {
  value: "high" | "med" | "low" | null;
}

const TOOLTIP_TEXT = "Display-only — not blended into the composite score";

/** Filled-dot color by tier — high reads strongest (pos), med cautionary (warn), low weakest (muted). */
const TIER_COLOR: Record<"high" | "med" | "low", string> = {
  high: "var(--pos)",
  med: "var(--warn)",
  low: "var(--muted)",
};

function Dots({ value }: { value: "high" | "med" | "low" }) {
  const filledCount = value === "high" ? 3 : value === "med" ? 2 : 1;
  const color = TIER_COLOR[value];
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => {
        const filled = i < filledCount;
        return (
          <span
            key={i}
            className="block h-2 w-2 rounded-full"
            style={{
              background: filled ? color : "transparent",
              border: filled ? "none" : "1px solid var(--muted)",
              opacity: filled ? 1 : 0.3,
            }}
          />
        );
      })}
    </span>
  );
}

export default function ConvictionDot({ value }: ConvictionDotProps) {
  if (value === null) {
    return <span className="font-mono text-[13px] text-muted tabular-nums">—</span>;
  }

  return (
    <InfoTip content={TOOLTIP_TEXT} label={`Conviction: ${value}`}>
      <Dots value={value} />
    </InfoTip>
  );
}
