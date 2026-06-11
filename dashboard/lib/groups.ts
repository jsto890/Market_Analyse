import type { BridgeRow, ReportGroup } from "@/types/bridge";

export const ACTION_ORDER = [
  "PRIME_LONG",
  "BREAKOUT_LONG",
  "STANDARD_LONG",
  "WATCH",
  "WAIT",
  "AVOID",
] as const;

const STRONG = new Set(["LSNS", "LNLL", "LSNL"]);
const WEAK = new Set(["LNNL", "LLNL"]);

export function comboClass(combo: string | undefined | null): "strong" | "neutral" | "weak" {
  if (!combo) return "neutral";
  const c4 = combo.slice(0, 4);
  if (STRONG.has(c4)) return "strong";
  if (WEAK.has(c4)) return "weak";
  return "neutral";
}

const COMBO_CLASS_ORDER = { strong: 0, neutral: 1, weak: 2 } as const;

export function tierSort(a: BridgeRow, b: BridgeRow): number {
  const ai = ACTION_ORDER.indexOf(a.action_label as (typeof ACTION_ORDER)[number]);
  const bi = ACTION_ORDER.indexOf(b.action_label as (typeof ACTION_ORDER)[number]);
  const tierA = ai === -1 ? ACTION_ORDER.length : ai;
  const tierB = bi === -1 ? ACTION_ORDER.length : bi;
  if (tierA !== tierB) return tierA - tierB;

  const ca = COMBO_CLASS_ORDER[comboClass(a.combo)];
  const cb = COMBO_CLASS_ORDER[comboClass(b.combo)];
  if (ca !== cb) return ca - cb;

  const fa = Number.isFinite(a.combined_score);
  const fb = Number.isFinite(b.combined_score);
  if (!fa && !fb) return 0;
  if (!fa) return 1;
  if (!fb) return -1;
  return b.combined_score - a.combined_score;
}

function deriveGroup(row: BridgeRow): ReportGroup {
  if (row.group1) return "aligned";
  if (row.group2 && row.conviction === "high" && row.sentiment_score < 0.2) return "pullback";
  if (row.group2) return "tech_fund";
  return "other";
}

export function groupSignals(rows: BridgeRow[]): Record<ReportGroup, BridgeRow[]> {
  const groups: Record<ReportGroup, BridgeRow[]> = {
    aligned: [],
    pullback: [],
    tech_fund: [],
    other: [],
  };

  for (const row of rows) {
    const key: ReportGroup = row.report_group ?? deriveGroup(row);
    if (key in groups) {
      groups[key].push(row);
    } else {
      groups.other.push(row);
    }
  }

  return groups;
}
