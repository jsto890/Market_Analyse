import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(resolve(__dirname, "../globals.css"), "utf-8");

describe("globals.css design tokens", () => {
  it("defines --muted-2 in :root", () => {
    expect(css).toMatch(/--muted-2:\s*#737b8c/);
  });

  it("defines .tone-live/.tone-frozen/.tone-eod composed classes", () => {
    expect(css).toMatch(/\.tone-live\s*\{/);
    expect(css).toMatch(/\.tone-frozen\s*\{/);
    expect(css).toMatch(/\.tone-eod\s*\{/);
  });
});
