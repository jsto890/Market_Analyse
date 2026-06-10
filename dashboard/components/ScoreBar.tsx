interface ScoreBarProps {
  value: number;
  color?: string;
  label?: string;
}

export default function ScoreBar({ value, color = "#22c55e", label }: ScoreBarProps) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {label && (
        <span className="text-xs text-gray-400 font-mono tabular-nums w-8 text-right shrink-0">
          {label}
        </span>
      )}
    </div>
  );
}
