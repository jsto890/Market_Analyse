import { describe, it, expect } from "vitest";

describe("component test environment setup", () => {
  it("polyfills matchMedia (used by prefers-reduced-motion checks)", () => {
    expect(typeof window.matchMedia).toBe("function");
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
  });

  it("polyfills ResizeObserver (used by recharts / lightweight-charts)", () => {
    expect(typeof window.ResizeObserver).toBe("function");
    expect(() => new window.ResizeObserver(() => {}).observe(document.body)).not.toThrow();
  });

  it("extends expect with jest-dom matchers", () => {
    document.body.innerHTML = "<button disabled>x</button>";
    expect(document.querySelector("button")).toBeDisabled();
  });
});
