// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

let capturedOptions: any;
vi.mock("swr", () => ({
  default: (_key: string, _fetcher: unknown, options: any) => {
    capturedOptions = options;
    return { data: undefined, error: undefined, isLoading: true };
  },
}));

import { useCalendar } from "@/lib/calendar";

describe("useCalendar visibility-aware polling (G-13)", () => {
  it("passes refreshInterval that returns 0 while hidden, 300000 while visible", () => {
    useCalendar(7);

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    expect(capturedOptions.refreshInterval()).toBe(0);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    expect(capturedOptions.refreshInterval()).toBe(300_000);
  });
});
