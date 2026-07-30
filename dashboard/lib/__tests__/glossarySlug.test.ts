import { describe, it, expect } from "vitest";
import { glossarySlug } from "@/lib/glossarySlug";

describe("glossarySlug", () => {
  it("maps known symbol/abbreviation keys via the override table", () => {
    expect(glossarySlug("⚑")).toBe("flags");
    expect(glossarySlug("RS-Ratio")).toBe("rs-ratio");
    expect(glossarySlug("C")).toBe("conviction");
  });

  it("falls back to a generic lowercase-dash slug for plain keys", () => {
    expect(glossarySlug("ma_trend")).toBe("ma-trend");
    expect(glossarySlug("PRIME_LONG")).toBe("prime-long");
  });
});
