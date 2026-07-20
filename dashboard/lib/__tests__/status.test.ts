import { describe, it, expect } from "vitest";
import { worstOf, classifyAge } from "../status";

describe("worstOf", () => {
  it("down beats everything", () => expect(worstOf(["ok", "down", "idle"])).toBe("down"));
  it("warn beats idle and ok", () => expect(worstOf(["idle", "warn", "ok"])).toBe("warn"));
  it("all ok", () => expect(worstOf(["ok", "ok"])).toBe("ok"));
  it("idle beats ok (visible but muted)", () => expect(worstOf(["ok", "idle"])).toBe("idle"));
  it("empty -> ok", () => expect(worstOf([])).toBe("ok"));
});

describe("classifyAge", () => {
  const opts = { warnAfter: 24, downAfter: 48, marketClosedNow: false };
  it("fresh -> ok", () => expect(classifyAge(2, opts)).toBe("ok"));
  it("stale -> warn", () => expect(classifyAge(30, opts)).toBe("warn"));
  it("dead -> down", () => expect(classifyAge(50, opts)).toBe("down"));
  it("weekend staleness -> idle not red", () =>
    expect(classifyAge(50, { ...opts, marketClosedNow: true })).toBe("idle"));
  it("weekend mild staleness -> idle", () =>
    expect(classifyAge(30, { ...opts, marketClosedNow: true })).toBe("idle"));
});
