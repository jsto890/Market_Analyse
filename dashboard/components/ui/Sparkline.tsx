interface SparklineProps {
  values: number[];
  w?: number;
  h?: number;
  /** Stroke tone class — the line draws in currentColor. */
  className?: string;
}

export default function Sparkline({ values, w = 120, h = 32, className = "text-muted" }: SparklineProps) {
  const clean = values.filter(Number.isFinite);

  if (clean.length < 2) {
    return <svg width={w} height={h} aria-hidden="true" />;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;

  const points = clean
    .map((v, i) => {
      const x = (i / (clean.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const first = clean[0];
  const last = clean[clean.length - 1];
  const pctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const trendLabel =
    Math.abs(pctChange) < 0.05
      ? "Trend: flat"
      : `Trend: ${pctChange > 0 ? "up" : "down"} ${Math.abs(pctChange).toFixed(1)}%`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={trendLabel}
      style={{ display: "block" }}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={className}
      />
    </svg>
  );
}
