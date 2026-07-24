// Return-cell heatmap: a subtle background tint whose opacity scales with the
// magnitude of a percentage move (clamped), keeping the sign color. Used to make
// return columns readable at a glance across the app's tables.
export function heatBg(v: number | null | undefined, clamp = 10): string | undefined {
  if (v == null || !Number.isFinite(v) || v === 0) return undefined;
  const alpha = Math.min(1, Math.abs(v) / clamp) * 0.22;
  const rgb = v >= 0 ? "63,185,80" : "248,81,73"; // --green / --red
  return `rgba(${rgb},${alpha.toFixed(3)})`;
}
