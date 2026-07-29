// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMarketClock } from "@/lib/useMarketClock";

vi.mock("@/lib/market-clock", () => {
  let call = 0;
  return {
    usMarketState: vi.fn(() => (call++ === 0 ? "closed" : "pre")),
    futuresMarketState: vi.fn(() => "open"),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useMarketClock", () => {
  it("re-computes session state on a 30s tick without an external re-render trigger (G-05)", () => {
    const { result } = renderHook(() => useMarketClock());
    expect(result.current.us).toBe("closed");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.us).toBe("pre");
  });
});
