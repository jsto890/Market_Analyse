/**
 * The `catalysts` column of a bridge row: `contract+, earnings_beat+` —
 * comma-separated tokens, each suffixed with the direction it cuts, and a
 * literal `nan` when there are none.
 *
 * Both readers of the column used to split on `/[+;]/` — the sign, not the
 * separator — which left a leading comma on every token after the first and
 * rendered `nan` as a catalyst. One parser, so the fix can't drift apart again.
 */
export interface Catalyst {
  /** The token as it reads, underscores out: `earnings beat`. */
  label: string;
  /** Which way the feed says it cuts; null when the token carries no sign. */
  direction: "up" | "down" | null;
}

const ARROW = { up: "▲", down: "▼" } as const;

export function parseCatalysts(value: string | null | undefined): Catalyst[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((s) => s.replace(/"/g, "").trim())
    .filter((s) => s && s.toLowerCase() !== "nan")
    .map(
      (s): Catalyst => ({
        label: s.replace(/[+-]$/, "").replace(/_/g, " ").trim(),
        direction: s.endsWith("+") ? "up" : s.endsWith("-") ? "down" : null,
      })
    )
    .filter((c) => c.label.length > 0);
}

/** `earnings beat ▲` — the one-line form for a tooltip or a chip. */
export function catalystText(c: Catalyst): string {
  return c.direction ? `${c.label} ${ARROW[c.direction]}` : c.label;
}
