import { describe, it, expect, beforeEach } from "vitest";
import { resetLocalStorage } from "@/test/localStorage";
import { STATIC_KEYS, DYNAMIC_KEY_PREFIXES, LEGACY_KEY_PREFIXES, resetAllStoredPrefs } from "@/lib/storageKeys";

beforeEach(() => {
  resetLocalStorage();
});

describe("storageKeys registry", () => {
  it("names the today-filters static key", () => {
    expect(STATIC_KEYS.todayFilters).toBe("dash:today:filters");
  });

  it("lists the collapsible/table/chart dynamic prefixes", () => {
    expect(DYNAMIC_KEY_PREFIXES).toContain("dash:collapsible:");
    expect(DYNAMIC_KEY_PREFIXES).toContain("dash:table:");
    expect(DYNAMIC_KEY_PREFIXES).toContain("dash:chart:");
  });

  it("lists the retired panel prefix and the legacy watchlist key", () => {
    expect(LEGACY_KEY_PREFIXES).toContain("dash:panel:");
    expect(LEGACY_KEY_PREFIXES).toContain("argus_watchlist");
  });
});

describe("resetAllStoredPrefs", () => {
  it("clears every dash:* key and the legacy watchlist key", () => {
    localStorage.setItem("dash:today:filters", "{}");
    localStorage.setItem("dash:collapsible:rotation", "1");
    localStorage.setItem("dash:table:screener:sort", "score");
    localStorage.setItem("dash:chart:AAPL", "{}");
    localStorage.setItem("dash:panel:diff", "0");
    localStorage.setItem("argus_watchlist", "[]");

    resetAllStoredPrefs();

    expect(localStorage.getItem("dash:today:filters")).toBeNull();
    expect(localStorage.getItem("dash:collapsible:rotation")).toBeNull();
    expect(localStorage.getItem("dash:table:screener:sort")).toBeNull();
    expect(localStorage.getItem("dash:chart:AAPL")).toBeNull();
    expect(localStorage.getItem("dash:panel:diff")).toBeNull();
    expect(localStorage.getItem("argus_watchlist")).toBeNull();
  });

  it("leaves unrelated keys untouched", () => {
    localStorage.setItem("some_other_app_key", "keep-me");
    resetAllStoredPrefs();
    expect(localStorage.getItem("some_other_app_key")).toBe("keep-me");
  });
});
