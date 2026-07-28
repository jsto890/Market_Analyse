"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export interface GexChartProps {
  gexProfileJson: string | null;
}

interface GexDataPoint {
  strike: number;
  gex: number;
}

export default function GexChart({ gexProfileJson }: GexChartProps) {
  if (!gexProfileJson) {
    return (
      <div className="flex items-center justify-center h-[300px] rounded border border-line bg-surface text-muted text-sm">
        No GEX data
      </div>
    );
  }

  try {
    const parsed = JSON.parse(gexProfileJson);

    // Handle format: {strikes: [...], gex: [...]}
    if (!parsed.strikes || !parsed.gex || !Array.isArray(parsed.strikes) || !Array.isArray(parsed.gex)) {
      throw new Error("Invalid GEX profile format");
    }

    const data: GexDataPoint[] = parsed.strikes.map((strike: number, idx: number) => ({
      strike,
      gex: parsed.gex[idx] || 0,
    }));

    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[300px] rounded border border-line bg-surface text-muted text-sm">
          No GEX data points
        </div>
      );
    }

    // Determine color based on net GEX (bullish = green, bearish = red)
    const netGex = data.reduce((sum, d) => sum + d.gex, 0);
    const isBullish = netGex > 0;
    const color = isBullish ? "#10b981" : "#ef4444"; // green / red

    // Format Y-axis label in millions
    const formatYAxis = (value: number) => {
      if (value === 0) return "0";
      if (Math.abs(value) >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(0)}M`;
      }
      if (Math.abs(value) >= 1_000) {
        return `${(value / 1_000).toFixed(0)}K`;
      }
      return value.toString();
    };

    const CustomTooltip = ({ active, payload }: any) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload as GexDataPoint;
        return (
          <div className="bg-elevated border border-line rounded px-3 py-2 text-xs font-mono shadow-lg">
            <p className="text-foreground">Strike: ${data.strike.toFixed(2)}</p>
            <p className={isBullish ? "text-pos" : "text-neg"}>
              GEX: ${(data.gex / 1_000_000).toFixed(2)}M
            </p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="w-full rounded border border-line bg-surface p-3">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="gexGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="strike"
              tick={{ fontSize: 11 }}
              stroke="rgba(255,255,255,0.3)"
              type="number"
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fontSize: 11 }}
              stroke="rgba(255,255,255,0.3)"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="gex"
              stroke={color}
              fill="url(#gexGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  } catch (err) {
    console.error("Failed to parse GEX profile:", err);
    return (
      <div className="flex items-center justify-center h-[300px] rounded border border-line bg-surface text-neg text-sm">
        Invalid GEX profile data
      </div>
    );
  }
}
