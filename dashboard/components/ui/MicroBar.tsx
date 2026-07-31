interface MicroBarProps {
  value: number;
}

export default function MicroBar({ value }: MicroBarProps) {
  const clamped = Math.max(-1, Math.min(1, value));
  const isPos = clamped >= 0;
  const pct = Math.abs(clamped) * 50;

  return (
    <span className="relative inline-block rounded-sm bg-elevated overflow-hidden" style={{ width: 56, height: 8 }}>
      <span
        className="absolute top-0 h-full"
        style={{
          left: isPos ? "50%" : `${50 - pct}%`,
          width: `${pct}%`,
          // Sub-scores are model output — direction reads from which side of
          // centre fills, never from P&L green/red.
          background: "var(--model)",
        }}
      />
      <span
        className="absolute top-0 h-full w-px bg-muted/50"
        style={{ left: "50%" }}
      />
    </span>
  );
}
