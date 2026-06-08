interface ReturnsBarProps {
  values: { label: string; value: number | null }[];
}

export default function ReturnsBar({ values }: ReturnsBarProps) {
  const maxAbs = Math.max(
    1e-6,
    ...values.map((v) => (v.value == null ? 0 : Math.abs(v.value)))
  );

  return (
    <div className="space-y-0.5">
      {values.map(({ label, value }) => {
        const positive = (value ?? 0) >= 0;
        const width = value == null ? 0 : (Math.abs(value) / maxAbs) * 100;
        return (
          <div key={label} className="flex items-center gap-2 font-mono text-xs">
            <span className="w-6 shrink-0 text-gray-500">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-sm bg-[#0d1117]">
              {value != null && (
                <div
                  className={`h-full rounded-sm ${positive ? "bg-green-500" : "bg-red-500"}`}
                  style={{ width: `${width}%` }}
                />
              )}
            </div>
            <span
              className={`w-14 shrink-0 text-right ${
                value == null
                  ? "text-gray-600"
                  : positive
                    ? "text-green-400"
                    : "text-red-400"
              }`}
            >
              {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
