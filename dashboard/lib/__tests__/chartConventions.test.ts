import { describe, it, expect } from "vitest";
import { resolveChartTokens, hexWithAlpha, CHART_HEIGHT, CHART_AXIS_STYLE } from "@/lib/chartConventions";

describe("resolveChartTokens", () => {
  it("reads CSS custom properties off the given element", () => {
    const el = document.createElement("div");
    el.style.setProperty("--bg", "#111111");
    el.style.setProperty("--text", "#eeeeee");
    el.style.setProperty("--muted", "#999999");
    el.style.setProperty("--line", "#222222");
    el.style.setProperty("--line-strong", "#333333");
    el.style.setProperty("--green", "#00ff00");
    el.style.setProperty("--red", "#ff0000");
    el.style.setProperty("--accent", "#0000ff");
    el.style.setProperty("--amber", "#ffaa00");
    el.style.setProperty("--teal", "#00ffff");
    el.style.setProperty("--model", "#9d7cf5");
    document.body.appendChild(el);
    const tokens = resolveChartTokens(el);
    expect(tokens).toEqual({
      bg: "#111111", text: "#eeeeee", muted: "#999999", line: "#222222",
      lineStrong: "#333333", green: "#00ff00", red: "#ff0000",
      accent: "#0000ff", amber: "#ffaa00", teal: "#00ffff", model: "#9d7cf5",
    });
    document.body.removeChild(el);
  });

  it("falls back to the globals.css literal values when a property resolves empty", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const tokens = resolveChartTokens(el);
    expect(tokens.bg).toBe("#06090f");
    expect(tokens.green).toBe("#3fb950");
    expect(tokens.red).toBe("#f85149");
    expect(tokens.accent).toBe("#4c8dff");
    expect(tokens.model).toBe("#9d7cf5");
    document.body.removeChild(el);
  });
});

describe("hexWithAlpha", () => {
  it("appends an 8-digit alpha channel", () => {
    expect(hexWithAlpha("#3fb950", 0.4)).toBe("#3fb95066");
    expect(hexWithAlpha("#f85149", 1)).toBe("#f85149ff");
    expect(hexWithAlpha("#f85149", 0)).toBe("#f8514900");
  });
});

describe("chart-wide constants", () => {
  it("CHART_HEIGHT is the shared responsive clamp, not a fixed pixel value", () => {
    expect(CHART_HEIGHT).toBe("clamp(320px, 42vh, 640px)");
  });

  it("CHART_AXIS_STYLE references only design tokens, never hex literals", () => {
    Object.values(CHART_AXIS_STYLE).forEach((v) => {
      expect(v.startsWith("var(--")).toBe(true);
    });
    expect(CHART_AXIS_STYLE).toEqual({
      tick: "var(--muted)",
      axisLine: "var(--line-strong)",
      grid: "var(--line)",
      referenceLine: "var(--line-strong)",
      pointLabel: "var(--text)",
    });
  });
});
