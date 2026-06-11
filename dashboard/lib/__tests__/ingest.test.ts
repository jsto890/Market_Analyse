import { describe, it, expect } from "vitest";
import { latestPerDay, rowToSignal } from "@/lib/ingest";

it("keeps lexicographically-latest file per day", () => {
  expect(
    latestPerDay([
      "bridge_20260610_0800.csv",
      "bridge_20260610_1450.csv",
      "bridge_20260609_0800.csv",
    ])
  ).toEqual(
    new Map([
      ["20260610", "bridge_20260610_1450.csv"],
      ["20260609", "bridge_20260609_0800.csv"],
    ])
  );
});

it("maps a CSV row to a signal record", () => {
  const r = rowToSignal(
    {
      ticker: "AMD",
      combined_score: 0.74,
      high_conviction: true,
      group1: true,
      group2: false,
      near_aligned: false,
      conviction: "high",
    },
    "2026-06-10"
  );
  expect(r).toMatchObject({
    date: "2026-06-10",
    ticker: "AMD",
    high_conviction: 1,
    report_group: "aligned",
  });
});

it("rejects rows with non-finite combined_score", () => {
  expect(rowToSignal({ ticker: "AMD", combined_score: NaN }, "2026-06-10")).toBeNull();
  expect(rowToSignal({ ticker: "AMD", combined_score: null }, "2026-06-10")).toBeNull();
  expect(rowToSignal({ ticker: "AMD", combined_score: "" }, "2026-06-10")).toBeNull();
  expect(rowToSignal({ ticker: "AMD", combined_score: Infinity }, "2026-06-10")).toBeNull();
});

it("rejects rows without a ticker", () => {
  expect(rowToSignal({ combined_score: 0.5 }, "2026-06-10")).toBeNull();
  expect(rowToSignal({ ticker: "", combined_score: 0.5 }, "2026-06-10")).toBeNull();
});

it("uppercases ticker", () => {
  const r = rowToSignal({ ticker: "amd", combined_score: 0.5 }, "2026-06-10");
  expect(r?.ticker).toBe("AMD");
});

it("derives pullback group when group2=true, conviction=high, sentiment_score<0.20", () => {
  const r = rowToSignal(
    { ticker: "TSLA", combined_score: 0.6, group1: false, group2: true, conviction: "high", sentiment_score: 0.15 },
    "2026-06-10"
  );
  expect(r?.report_group).toBe("pullback");
});

it("derives tech_fund group when group2=true but not pullback conditions", () => {
  const r = rowToSignal(
    { ticker: "TSLA", combined_score: 0.6, group1: false, group2: true, conviction: "high", sentiment_score: 0.5 },
    "2026-06-10"
  );
  expect(r?.report_group).toBe("tech_fund");
});

it("derives other group when neither group1 nor group2", () => {
  const r = rowToSignal(
    { ticker: "TSLA", combined_score: 0.6, group1: false, group2: false },
    "2026-06-10"
  );
  expect(r?.report_group).toBe("other");
});

it("uses report_group from CSV when present", () => {
  const r = rowToSignal(
    { ticker: "TSLA", combined_score: 0.6, report_group: "custom_group", group1: true },
    "2026-06-10"
  );
  expect(r?.report_group).toBe("custom_group");
});

it("booleans map to 0/1 integers", () => {
  const r = rowToSignal(
    { ticker: "AMD", combined_score: 0.5, high_conviction: false, near_aligned: true },
    "2026-06-10"
  );
  expect(r?.high_conviction).toBe(0);
  expect(r?.near_aligned).toBe(1);
});
