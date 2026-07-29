// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { visibilityAwareInterval } from "@/lib/swr-visibility";

afterEach(() => {
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
});

describe("visibilityAwareInterval", () => {
  it("returns 0 while document hidden, pausing SWR polling (G-13)", () => {
    const interval = visibilityAwareInterval(60_000);

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    expect(interval()).toBe(0);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    expect(interval()).toBe(60_000);
  });
});
