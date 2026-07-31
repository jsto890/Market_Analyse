// dashboard/components/ui/CenterBar.tsx
export interface CenterBarProps {
  /** Value in [-1, 1]; clamped. */
  value: number;
  /** Pixel width. Default: 56 (table-cell size; use 100 for WhyPanel's NetBar, 80 for the old NetBar exactly). */
  width?: number;
  /** Pixel height. Default: 8. */
  height?: number;
  /** Show the numeric value to the right, e.g. "+0.42". Default: false. */
  showValue?: boolean;
}

export default function CenterBar({ value, width = 56, height = 8, showValue = false }: CenterBarProps) {
  if (!Number.isFinite(value)) {
    return <span className="font-mono text-body tabular-nums text-muted">—</span>;
  }
  const clamped = Math.max(-1, Math.min(1, value));
  const isPos = clamped >= 0;
  const pct = Math.abs(clamped) * 50;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="relative inline-block rounded-sm bg-elevated overflow-hidden"
        style={{ width, height }}
      >
        <span
          className="absolute top-0 h-full"
          style={{ left: isPos ? "50%" : `${50 - pct}%`, width: `${pct}%`, background: isPos ? "var(--green)" : "var(--red)" }}
        />
        <span className="absolute top-0 h-full w-px bg-muted/50" style={{ left: "50%" }} />
      </span>
      {showValue && (
        <span className="font-mono text-body tabular-nums text-muted w-[38px] text-right">
          {clamped > 0 ? "+" : ""}
          {clamped.toFixed(2)}
        </span>
      )}
    </span>
  );
}
