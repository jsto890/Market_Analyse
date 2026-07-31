/** Shared chart-rendering conventions — colors, height, axis style — for
 *  every chart in the app (Recharts SVG charts and lightweight-charts canvas
 *  charts alike). See docs/superpowers/plans/2026-07-28-ui-audit/06-phase5-rotation-macro-charts.md
 *  "Chart Conventions Spec" for the full rationale. */

export interface ChartTokens {
  bg: string; text: string; muted: string; line: string; lineStrong: string;
  green: string; red: string; accent: string; amber: string; teal: string;
  /** Model output (scores, conviction) — never --accent, which means
   *  "interactive", and never green/red, which mean money direction. */
  model: string;
}

/** globals.css `:root` literal values — used only if a custom property
 *  resolves empty (defends against calling this before the stylesheet is
 *  attached; should not happen since callers only invoke this from a
 *  mount-time effect). */
const FALLBACK: ChartTokens = {
  bg: "#06090f", text: "#eef1f6", muted: "#7d8698", line: "#1e2634",
  lineStrong: "#2c3648", green: "#3fb950", red: "#f85149",
  accent: "#4c8dff", amber: "#d29922", teal: "#2dd4bf", model: "#9d7cf5",
};

function readVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = style.getPropertyValue(name).trim();
  return v.length > 0 ? v : fallback;
}

/** Resolve the app's CSS custom properties into literal color strings, for
 *  chart libraries (lightweight-charts) that paint to a <canvas> and cannot
 *  understand `var(--x)` references. Call once per mount/data-apply, inside
 *  a client-only effect — never at module scope. */
export function resolveChartTokens(el: HTMLElement = document.documentElement): ChartTokens {
  const style = getComputedStyle(el);
  return {
    bg: readVar(style, "--bg", FALLBACK.bg),
    text: readVar(style, "--text", FALLBACK.text),
    muted: readVar(style, "--muted", FALLBACK.muted),
    line: readVar(style, "--line", FALLBACK.line),
    lineStrong: readVar(style, "--line-strong", FALLBACK.lineStrong),
    green: readVar(style, "--green", FALLBACK.green),
    red: readVar(style, "--red", FALLBACK.red),
    accent: readVar(style, "--accent", FALLBACK.accent),
    amber: readVar(style, "--amber", FALLBACK.amber),
    teal: readVar(style, "--teal", FALLBACK.teal),
    model: readVar(style, "--model", FALLBACK.model),
  };
}

/** Append an 8-digit hex alpha channel to a resolved hex color, e.g. for
 *  canvas fillStyle transparency without a separate rgba() code path. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex}${a.toString(16).padStart(2, "0")}`;
}

/** One responsive height for every chart — replaces every hardcoded pixel
 *  height (RRGChart's 420, MacroChart's 320). See spec §5. */
export const CHART_HEIGHT = "clamp(320px, 42vh, 640px)";

/** SVG/Recharts axis + grid + reference-line token colors — one place, so
 *  every Recharts-based chart resolves the same way instead of hand-rolling
 *  hex literals (RRGChart today; GexChart later). See spec §3. */
export const CHART_AXIS_STYLE = {
  tick: "var(--muted)",
  axisLine: "var(--line-strong)",
  grid: "var(--line)",
  referenceLine: "var(--line-strong)",
  pointLabel: "var(--text)",
} as const;
