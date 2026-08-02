import type { ReactNode } from "react";

interface FlowRatioTileProps {
  label: string;
  value: string;
  /** Tone for the figure. Amber marks a count worth looking at; the ratios sit at rest. */
  valueTone?: string;
  legend?: ReactNode;
  sentence?: string;
  children: ReactNode;
}

/**
 * One of the three ratio tiles on the flow page: an eyebrow, the figure, a
 * gauge, the gauge's own scale, and one sentence saying what the figure means.
 * The sentence is always derived from the same feed as the figure — there is no
 * historical median behind this endpoint, so nothing here compares to one.
 */
export default function FlowRatioTile({
  label,
  value,
  valueTone = "text-foreground",
  legend,
  sentence,
  children,
}: FlowRatioTileProps) {
  return (
    <div className="rounded-[8px] border border-line bg-elevated p-[14px_16px]">
      <div className="mb-[9px] flex items-baseline justify-between gap-2">
        <span className="eyebrow truncate">{label}</span>
        <span className={`shrink-0 font-mono text-headline tabular-nums ${valueTone}`}>{value}</span>
      </div>
      {children}
      {legend && <div className="mt-[5px] flex justify-between gap-2 text-micro text-muted">{legend}</div>}
      {sentence && <p className="mt-[9px] text-body text-3">{sentence}</p>}
    </div>
  );
}

/**
 * Put/call gauge on a fixed 0–2 scale with parity marked at the centre, so two
 * tiles side by side are read against the same axis. Calls fill left of parity,
 * puts right.
 */
export function RatioGauge({ ratio }: { ratio: number }) {
  const pos = (Math.max(0, Math.min(2, ratio)) / 2) * 100;
  const putLeaning = ratio >= 1;
  return (
    <div className="relative h-[6px] overflow-hidden rounded-[3px] bg-raised">
      {/* Tint as the mock declares it — colour token plus an opacity utility.
       * The `/70` modifier emits no rule at all against a `var()`-based colour. */}
      <span
        className={`absolute inset-y-0 rounded-[2px] opacity-70 ${putLeaning ? "bg-put" : "bg-call"}`}
        style={{ left: `${putLeaning ? 50 : pos}%`, width: `${putLeaning ? pos - 50 : 50 - pos}%` }}
      />
      <span className="absolute inset-y-0 w-[2px] bg-foreground" style={{ left: "50%" }} />
    </div>
  );
}

/** One segment per unusual print, coloured by the side of the contract. */
export function SideSegments({ sides }: { sides: string[] }) {
  return (
    <div className="flex h-[6px] gap-[3px]">
      {sides.map((side, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[3px] opacity-70 ${side === "P" ? "bg-put" : "bg-call"}`}
        />
      ))}
    </div>
  );
}
