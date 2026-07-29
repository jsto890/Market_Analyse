import type { ActionCardData } from "@/types/argus";

export function makeActionCardData(overrides: Partial<ActionCardData> = {}): ActionCardData {
  return {
    symbol: "NVDA",
    verdict: "LONG",
    score: 0.62,
    high_conviction: false,
    entry: 100,
    stop: 95,
    target: 110,
    risk_reward: 2,
    long_votes: 40,
    short_votes: 10,
    wait_votes: 20,
    agreement_pct: 0.57,
    ret_1d: null,
    ret_5d: null,
    ret_20d: null,
    is_extended: false,
    entry_quality: "good",
    votes: [],
    agreed: [],
    dissented: [],
    notes: "",
    ...overrides,
  };
}
