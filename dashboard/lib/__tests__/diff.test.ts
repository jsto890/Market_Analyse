import { describe, it, expect } from "vitest";
import { diffReports } from "@/lib/diff";

const y = [
  { ticker: "AMD", report_group: "aligned", sentiment_score: 0.5 },
  { ticker: "QBTS", report_group: "pullback", sentiment_score: -0.08 },
  { ticker: "UNH", report_group: "aligned", sentiment_score: 0.3 },
] as any;

const t = [
  { ticker: "AMD", report_group: "aligned", sentiment_score: 0.5 },
  { ticker: "QBTS", report_group: "aligned", sentiment_score: 0.25 },
  { ticker: "AAOI", report_group: "tech_fund", sentiment_score: 0.28 },
] as any;

const d = diffReports(t, y);

it("flags new tickers", () => expect(d.newTickers.has("AAOI")).toBe(true));
it("flags drops with their old group", () =>
  expect(d.dropped).toEqual([{ ticker: "UNH", group: "aligned" }]));
it("flags group moves", () =>
  expect(d.groupMoves).toEqual([{ ticker: "QBTS", from: "pullback", to: "aligned" }]));
it("flags sentiment turns on yesterday-pullback names (Δ≥0.15)", () =>
  expect(d.sentimentTurns.has("QBTS")).toBe(true));

describe("edge cases", () => {
  it("ignores non-actionable groups on both sides", () => {
    const result = diffReports(
      [{ ticker: "X", report_group: "other", sentiment_score: 0.5 }] as any,
      [{ ticker: "Y", report_group: "other", sentiment_score: 0.5 }] as any
    );
    expect(result.newTickers.size).toBe(0);
    expect(result.dropped.length).toBe(0);
  });

  it("does not flag sentiment turn when delta < 0.15", () => {
    const result = diffReports(
      [{ ticker: "Z", report_group: "pullback", sentiment_score: 0.1 }] as any,
      [{ ticker: "Z", report_group: "pullback", sentiment_score: 0.0 }] as any
    );
    expect(result.sentimentTurns.has("Z")).toBe(false);
  });

  it("returns empty sets/arrays when both sides are empty", () => {
    const result = diffReports([], []);
    expect(result.newTickers.size).toBe(0);
    expect(result.dropped.length).toBe(0);
    expect(result.groupMoves.length).toBe(0);
    expect(result.sentimentTurns.size).toBe(0);
  });
});
