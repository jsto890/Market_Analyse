import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config";

/**
 * Tailwind's opacity scale steps by 5. An off-scale modifier like `bg-pos/12`
 * does not fail the build — it emits no rule at all, so the utility renders as
 * nothing and only the eye catches it. That is the same silent-omission class
 * that left all 91 tinted call sites blank until `d892fba`, and it came back
 * one commit later in the rail badges, where the tests asserted on the text
 * colour and never on the fill.
 *
 * Nothing in tsc, vitest or Playwright sees this, so it gets its own guard.
 */

const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["app", "components"];
// Resolved rather than hardcoded, so extending `theme.opacity` widens the guard
// instead of turning it into a false positive.
const SCALE = new Set(Object.keys(resolveConfig(tailwindConfig).theme?.opacity ?? {}));

/** `bg-teal/15`, `border-warn/50` — a colour utility with an alpha modifier.
 *  Arbitrary values (`/[12%]`) are excluded: they take a different code path. */
const MODIFIER = /\b(?:bg|text|border|ring|divide|outline|shadow|from|via|to|placeholder|caret|accent|decoration|fill|stroke)-[a-z0-9-]+\/(\d+)\b/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== "__tests__") walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        out.push(p);
      }
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

describe("tailwind opacity modifiers", () => {
  it("only uses steps that are on the scale, so every tint emits a rule", () => {
    const offScale: string[] = [];

    for (const file of DIRS.flatMap(sourceFiles)) {
      const src = fs.readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        MODIFIER.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = MODIFIER.exec(line)) !== null) {
          if (!SCALE.has(m[1])) {
            offScale.push(`${path.relative(ROOT, file)}:${i + 1}  ${m[0]}`);
          }
        }
      });
    }

    expect(
      offScale,
      `These emit no CSS. Nearest on-scale values are multiples of 5:\n${offScale.join("\n")}`,
    ).toEqual([]);
  });
});
