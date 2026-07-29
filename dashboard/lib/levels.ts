import type { BridgeRow } from "@/types/bridge";
import type { ActionCardData } from "@/types/argus";
import type { Level } from "@/components/charts/CandleChart";

export interface DerivedLevels {
  entry: number | null;
  stop: number | null;
  target: number | null;
  stop_anchor: string | null;
  risk_reward: number | null;
  source: "live" | "bridge";
}

type BridgeLevelFields = Pick<BridgeRow, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;
type CardLevelFields = Pick<ActionCardData, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;

/**
 * Single source of truth for "what are this ticker's entry/stop/target".
 * Extracted verbatim from LevelsCard.tsx's cardOk logic (TK-02): the nightly
 * bridge row often carries degenerate (entry === stop) placeholders, so a
 * live, valid action_card always wins when one is available.
 */
export function deriveLevels(
  bridgeRow: BridgeLevelFields,
  card: CardLevelFields | null | undefined
): DerivedLevels {
  const cardOk =
    card != null &&
    card.entry != null &&
    card.stop != null &&
    Number.isFinite(card.entry) &&
    Number.isFinite(card.stop) &&
    card.entry !== card.stop;

  const entry = cardOk ? (card!.entry as number) : bridgeRow.entry;
  const stop = cardOk ? (card!.stop as number) : bridgeRow.stop;
  const target = cardOk ? card!.target ?? bridgeRow.target : bridgeRow.target;
  const stop_anchor = (cardOk ? card!.stop_anchor : null) ?? bridgeRow.stop_anchor ?? null;
  const risk_reward =
    (cardOk ? card!.risk_reward : bridgeRow.risk_reward) ??
    (entry != null && stop != null && target != null && entry !== stop
      ? (target - entry) / (entry - stop)
      : null);

  return { entry, stop, target, stop_anchor, risk_reward, source: cardOk ? "live" : "bridge" };
}

export function levelsToChartLevels(d: DerivedLevels): Level[] {
  const out: Level[] = [];
  if (d.entry != null && Number.isFinite(d.entry)) out.push({ price: d.entry, kind: "entry" });
  if (d.stop != null && Number.isFinite(d.stop)) out.push({ price: d.stop, kind: "stop" });
  if (d.target != null && Number.isFinite(d.target)) out.push({ price: d.target, kind: "target" });
  return out;
}
