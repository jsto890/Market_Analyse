import { describe, it, expect } from "vitest";
import { deriveLevels, levelsToChartLevels } from "@/lib/levels";
import type { BridgeRow } from "@/types/bridge";
import type { ActionCardData } from "@/types/argus";

type BridgeLevelFields = Pick<BridgeRow, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;
type CardLevelFields = Pick<ActionCardData, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;

const bridgeRow: BridgeLevelFields = {
  entry: 100,
  stop: 95,
  target: 115,
  stop_anchor: "ATR(14) x1.5",
  risk_reward: 3,
};

describe("deriveLevels", () => {
  it("falls back to the bridge row when there is no live action_card", () => {
    expect(deriveLevels(bridgeRow, null)).toEqual({
      entry: 100,
      stop: 95,
      target: 115,
      stop_anchor: "ATR(14) x1.5",
      risk_reward: 3,
      source: "bridge",
    });
  });

  it("prefers the live action_card when entry/stop are distinct and finite", () => {
    const card: CardLevelFields = {
      entry: 101.5,
      stop: 96,
      target: 118,
      stop_anchor: "swing low",
      risk_reward: 2.8,
    };
    expect(deriveLevels(bridgeRow, card)).toEqual({
      entry: 101.5,
      stop: 96,
      target: 118,
      stop_anchor: "swing low",
      risk_reward: 2.8,
      source: "live",
    });
  });

  it("ignores a degenerate action_card (entry === stop) and falls back to the bridge row", () => {
    const card: CardLevelFields = { entry: 100, stop: 100, target: 110, stop_anchor: null, risk_reward: 0 };
    const d = deriveLevels(bridgeRow, card);
    expect(d.source).toBe("bridge");
    expect(d.entry).toBe(100);
    expect(d.stop).toBe(95);
  });

  it("computes risk_reward from entry/stop/target when neither source provides one", () => {
    const row: BridgeLevelFields = { entry: 100, stop: 90, target: 130, stop_anchor: "swing low", risk_reward: null };
    expect(deriveLevels(row, null).risk_reward).toBe(3);
  });
});

describe("levelsToChartLevels", () => {
  it("drops null fields and keeps only price/kind pairs, in entry/stop/target order", () => {
    expect(
      levelsToChartLevels({ entry: 100, stop: null, target: 115, stop_anchor: null, risk_reward: null, source: "bridge" })
    ).toEqual([
      { price: 100, kind: "entry" },
      { price: 115, kind: "target" },
    ]);
  });
});
