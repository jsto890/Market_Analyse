interface ScoreBarProps {
  value: number;
  showValue?: boolean;
}

export default function ScoreBar({ value, showValue }: ScoreBarProps) {
  const clamped = Math.max(-1, Math.min(1, value));
  const isPos = clamped >= 0;
  const pct = Math.abs(clamped) * 50;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-2 w-[100px] rounded-sm bg-elevated overflow-hidden">
        <span
          className="absolute top-0 h-full"
          style={{
            left: isPos ? "50%" : `${50 - pct}%`,
            width: `${pct}%`,
            background: isPos ? "var(--green)" : "var(--red)",
          }}
        />
        <span
          className="absolute top-0 h-full w-px bg-muted/50"
          style={{ left: "50%" }}
        />
      </span>
      {showValue && (
        <span className="font-mono text-[13px] tabular-nums text-muted w-[38px] text-right">
          {clamped >= 0 ? "+" : ""}
          {clamped.toFixed(2)}
        </span>
      )}
    </span>
  );
}
