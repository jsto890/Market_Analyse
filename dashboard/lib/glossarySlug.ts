const OVERRIDES: Record<string, string> = {
  "⚑": "flags",
  "◉": "quadrant",
  "Δrank": "drank",
  "RS-Ratio": "rs-ratio",
  "RS-Mom": "rs-mom",
  C: "conviction",
  Cat: "catalysts",
  Sent: "sentiment-leg",
  Tech: "technical-leg",
  Fund: "fundamental-leg",
  n: "basket-size",
};

export function glossarySlug(key: string): string {
  if (key in OVERRIDES) return OVERRIDES[key];
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
