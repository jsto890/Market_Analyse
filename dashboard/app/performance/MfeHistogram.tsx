"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Bucket {
  label: string;
  count: number;
}

interface Props {
  buckets: Bucket[];
  medianPeak: number;
}

export default function MfeHistogram({ buckets, medianPeak }: Props) {
  // Find which bucket contains the median so we can highlight it
  const medianBucketIndex = buckets.findIndex((b) => {
    const lo = parseInt(b.label.split("–")[0], 10);
    return medianPeak >= lo && medianPeak < lo + 10;
  });

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--color-muted, #888)" }}
            angle={-45}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--color-muted, #888)" }}
            allowDecimals={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-elevated, #1e1e1e)",
              border: "1px solid var(--color-line, #333)",
              borderRadius: 4,
              fontSize: 12,
            }}
            itemStyle={{ color: "var(--color-foreground, #eee)" }}
            labelStyle={{ color: "var(--color-muted, #888)", marginBottom: 2 }}
            formatter={(value) => [value, "picks"]}
          />
          <ReferenceLine
            x={buckets[medianBucketIndex >= 0 ? medianBucketIndex : 0]?.label}
            stroke="var(--color-warn, #f59e0b)"
            strokeDasharray="4 2"
            label={{
              value: `median ${medianPeak}%`,
              position: "top",
              fontSize: 10,
              fill: "var(--color-warn, #f59e0b)",
            }}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {buckets.map((_, i) => (
              <Cell
                key={i}
                fill={
                  i === medianBucketIndex
                    ? "var(--color-accent, #3b82f6)"
                    : "var(--color-pos, #22c55e)"
                }
                fillOpacity={i === medianBucketIndex ? 1 : 0.6}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
