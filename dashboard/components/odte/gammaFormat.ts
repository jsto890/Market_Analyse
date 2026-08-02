/** Formatting shared by the gamma blocks. Local to `/options/gamma` — the
 *  profile, the expiry bars and the levels card have to agree on units and on
 *  how a strike prints, or a bar stops meaning the number beside it. */

/* Tinted fills.
 *
 * Tailwind's `/opacity` modifier compiles to **nothing** against a `var()`
 * colour, and every colour in the token layer is declared that way
 * (`teal: "var(--teal)"`). `bg-teal/10` emits no rule at all — verified against
 * the built stylesheet, which contains no `.bg-teal\/N` — so a tint written
 * that way is invisible rather than subtle. They are written as explicit
 * `color-mix` arbitrary values instead: still Tailwind, still the token, no hex.
 */
export const TINT_TEAL = "bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]";
export const TINT_PUT = "bg-[color-mix(in_srgb,var(--put)_10%,transparent)]";
/** Short gamma (magenta, moves extend) → long gamma (teal, moves pin). */
export const FLIP_SCALE =
  "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--put)_40%,transparent),var(--line)_46%,var(--line)_54%,color-mix(in_srgb,var(--teal)_40%,transparent))]";
/** The amber "what happens next" card. */
export const WARN_SURFACE =
  "border-[color-mix(in_srgb,var(--amber)_50%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)]";

/** One unit for a whole set of GEX figures, so bar widths and printed values
 *  are on the same scale. Values arrive as dollars per 1% move. */
export function gexUnit(max: number): { div: number; suffix: string } {
  if (max >= 1e8) return { div: 1e9, suffix: "B" };
  if (max >= 1e6) return { div: 1e6, suffix: "M" };
  return { div: 1, suffix: "" };
}

/** Round up to the next 1 / 2 / 2.5 / 5 × 10ⁿ — the printed axis end, so a bar
 *  can be converted back to a number by eye. */
export function niceCeil(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0;
  const base = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 2.5, 5]) {
    if (x <= m * base * 1.000001) return m * base;
  }
  return 10 * base;
}

/** Decimals that keep an axis end legible: 0.4 → 2, 4 → 1, 400 → 0. */
export function axisDecimals(axis: number): number {
  if (axis >= 10) return 0;
  if (axis >= 1) return 1;
  return 2;
}

/** Signed figure with the typographic minus the rest of the app uses. */
export function fmtSigned(value: number, decimals: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(decimals)}`;
}

/** A strike or level: integers stay integers, halves keep their fraction. */
export function fmtLevel(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

/** `2026-08-04` → `4 Aug`. Anything else (`0DTE`) passes through untouched. */
export function fmtExpiryLabel(expiry: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry);
  if (!m) return expiry;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
}
