"use client";

import { useState, useId } from "react";
import useSWR from "swr";
import { ChevronDown, AlertTriangle } from "lucide-react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import Failed from "@/components/ui/Failed";
import Loading from "@/components/ui/Loading";
import StatChip from "@/components/ui/StatChip";
import CenterBar from "@/components/ui/CenterBar";
import InfoTip from "@/components/ui/InfoTip";
import Collapsible from "@/components/ui/Collapsible";
import { BADGE_LABEL } from "@/components/ui/Badge";
import { useTickerData } from "@/lib/useTickerData";
import { COMBO_POSITION_LABEL, COMBO_LETTER_LABEL } from "@/lib/labels";
import { glossarySlug } from "@/lib/glossarySlug";
import type { ActionCardData, AgentVote } from "@/types/argus";
import type { BridgeRow } from "@/types/bridge";

const COMBO_NOTE: Record<string, string> = {
  LSNS: "dip-buy profile — trend up, oscillators cooled (best backtested class)",
  LNLL: "trend + squeeze + oscillators confirming",
  LSNL: "trend up, mixed confirmation",
  LNNL: "chasing risk — oscillators confirm into extension (backtested negative)",
  LLNL: "chasing risk — everything confirming late (backtested ~flat)",
};

/* ── The three legs ───────────────────────────────────────────────────────
 * The answer the panel owes the reader: what the call rests on, one sentence
 * per leg, with a three-bar meter for the strength behind it. Everything the
 * ensemble knows sits below, behind a disclosure — that is diagnostics.
 * A leg with no evidence feed renders its bar and its label and nothing else.
 */

interface Leg {
  /** Eyebrow — also the leg's identity in the bar's accessible name. */
  key: "SENT" | "TECH" | "FUND";
  /** 0–1. Decides how many of the three bars light, and their tone. */
  strength: number;
  sentence: string | null;
}

const BAR_HEIGHTS = [8, 11, 14];

/** Named catalyst votes. `vote_earnings_proximity` is deliberately absent —
 *  it counts toward strength, but the earnings clause names it in words. */
const CATALYST_VOTES: { key: keyof BridgeRow; label: string }[] = [
  { key: "vote_event_catalyst", label: "event" },
  { key: "vote_squeeze_setup", label: "squeeze" },
  { key: "vote_growth_profitability", label: "growth" },
  { key: "vote_analyst_upside", label: "analyst upside" },
];

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function numWord(n: number): string {
  return n === 1 ? "one" : n === 2 ? "two" : n === 3 ? "three" : String(n);
}

function litBars(strength: number): number {
  if (!Number.isFinite(strength)) return 1;
  return Math.max(1, Math.min(3, Math.ceil(strength * 3)));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Chatter: tone from the sentiment score, breadth from mentions/accounts. */
function sentimentLeg(row: BridgeRow): Leg {
  const raw = Number(row.sentiment_score);
  const score = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
  const tone =
    score >= 0.3 ? "Positive tone" : score <= -0.3 ? "Negative tone" : "Mixed tone";
  const mentions = Number(row.mentions);
  const accounts = Number(row.accounts);
  const hasBreadth = mentions > 0 && accounts > 0;

  return {
    key: "SENT",
    strength: (score + 1) / 2,
    sentence: hasBreadth
      ? `${tone} — ${plural(mentions, "mention")} across ${plural(accounts, "account")}.`
      : null,
  };
}

/** Technicals: the ensemble's own family votes, counted and named. */
function technicalLeg(card: ActionCardData): Leg {
  const fam = card.family_votes;
  let long = 0;
  let short = 0;
  let wait = 0;

  if (fam) {
    for (const counts of Object.values(fam)) {
      long += counts.long;
      short += counts.short;
      wait += counts.wait;
    }
  }
  if (long + short + wait === 0) {
    long = card.long_votes;
    short = card.short_votes;
    wait = card.wait_votes;
  }
  const total = long + short + wait;

  const leaders = fam
    ? Object.entries(fam)
        .filter(([family]) => family !== "other")
        .map(([family, counts]) => [family.replace(/_/g, " "), counts.long - counts.short] as const)
        .filter(([, net]) => net > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([family]) => family)
    : [];

  return {
    key: "TECH",
    strength: total > 0 ? long / total : 0,
    sentence:
      total > 0
        ? `${long} of ${total} agents long${leaders.length ? `, led by ${joinAnd(leaders)}` : ""}.`
        : null,
  };
}

/** Catalyst and fundamental leg: the bridge's five catalyst votes, plus the
 *  one earnings fact, in words. No feed behind the mock's growth prose. */
function fundamentalLeg(row: BridgeRow): Leg {
  const positive: string[] = [];
  const negative: string[] = [];
  for (const { key, label } of CATALYST_VOTES) {
    const v = Number(row[key]);
    if (v > 0) positive.push(label);
    else if (v < 0) negative.push(label);
  }
  const earningsVote = Number(row.vote_earnings_proximity) > 0 ? 1 : 0;

  const days = row.earnings_in_days;
  const earnings =
    days !== null && days !== undefined && days >= 0 && days <= 14
      ? days === 0
        ? "earnings today"
        : days === 1
          ? "earnings tomorrow"
          : `earnings in ${days} days`
      : null;

  const bits: string[] = [];
  if (positive.length) bits.push(`${joinAnd(positive)} positive`);
  if (negative.length) bits.push(`${joinAnd(negative)} negative`);
  if (earnings) bits.push(earnings);

  return {
    key: "FUND",
    strength: (positive.length + earningsVote) / (CATALYST_VOTES.length + 1),
    sentence: bits.length ? sentenceCase(`${bits.join(", ")}.`) : null,
  };
}

function LegRow({ leg }: { leg: Leg }) {
  const lit = litBars(leg.strength);
  // Green is a strong leg, amber a weak one — the shape the read-this foot
  // then counts. Two green and one amber is what a standard long looks like.
  const tone = lit >= 2 ? "bg-pos" : "bg-warn";

  return (
    <div className="flex items-start gap-[10px]">
      <span className="eyebrow w-[44px] shrink-0 pt-[2px]">{leg.key}</span>
      <span
        role="img"
        aria-label={`${leg.key} strength ${lit} of 3`}
        className="mt-[2px] flex h-[14px] shrink-0 items-end gap-[3px]"
      >
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={h}
            className={`w-[6px] rounded-[2px] ${i < lit ? tone : "bg-line-strong"}`}
            style={{ height: h }}
          />
        ))}
      </span>
      {leg.sentence && <span className="text-body text-2">{leg.sentence}</span>}
    </div>
  );
}

/** What the combination of legs means, stated as the call it produces. */
function legsReadThis(legs: Leg[], call: string): string {
  const green = legs.filter((l) => litBars(l.strength) >= 2).length;
  const amber = legs.length - green;
  const parts: string[] = [];
  if (green) parts.push(`${numWord(green)} green`);
  if (amber) parts.push(`${numWord(amber)} amber`);

  const count = `${numWord(legs.length)} leg${legs.length === 1 ? "" : "s"}`;
  return `${count}, each with the evidence behind the bar. ${sentenceCase(
    parts.join(" and ")
  )} is what "${call}" looks like.`;
}

interface FamilyRowProps {
  family: string;
  longV: number;
  shortV: number;
  waitV: number;
  attribution: number | undefined;
}

function FamilyRow({ family, longV, shortV, waitV, attribution }: FamilyRowProps) {
  const total = longV + shortV + waitV;
  const net = total > 0 ? (longV - shortV) / total : 0;
  const netInt = longV - shortV;
  const netStr = netInt >= 0 ? `+${netInt}` : `${netInt}`;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-[90px] shrink-0 truncate text-micro text-muted">
        {family}
      </span>
      <CenterBar value={net} width={80} />
      <span className="w-[28px] shrink-0 text-data text-foreground">
        {netStr}
      </span>
      <span className="text-data text-muted">
        {longV}/{total}
      </span>
      {attribution !== undefined && (
        <span className="ml-auto shrink-0 text-data text-model">
          LOO {attribution >= 0 ? "+" : ""}
          {attribution.toFixed(2)}
        </span>
      )}
    </div>
  );
}

interface VoteRowProps {
  agent: string;
  direction: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  note: string | null;
}

function VoteRow({ agent, direction, confidence, note }: VoteRowProps) {
  const dirClass = direction === "WAIT" ? "text-muted" : "text-model";

  return (
    <div className="flex items-baseline gap-2 py-px">
      <span className="min-w-0 flex-1 truncate text-label text-foreground">
        {agent}
      </span>
      <span className={`shrink-0 text-label ${dirClass}`}>
        {direction}
      </span>
      <span className="w-[32px] shrink-0 text-right text-data text-muted">
        {(confidence * 100).toFixed(0)}%
      </span>
      {note && (
        <InfoTip content={note} label={`${agent} rationale`}>
          <span className="max-w-[240px] shrink-0 truncate text-body text-muted">{note}</span>
        </InfoTip>
      )}
    </div>
  );
}

function groupVotesByFamily(
  votes: AgentVote[],
  familyOrder: string[]
): [string, AgentVote[]][] {
  const byFamily = new Map<string, AgentVote[]>();
  for (const v of votes) {
    if (!byFamily.has(v.family)) byFamily.set(v.family, []);
    byFamily.get(v.family)!.push(v);
  }
  const known = familyOrder
    .filter((f) => byFamily.has(f))
    .map((f): [string, AgentVote[]] => [f, byFamily.get(f)!]);
  const rest = Array.from(byFamily.entries()).filter(([f]) => !familyOrder.includes(f));
  return [...known, ...rest];
}

function VoteSection({
  title,
  tone,
  groups,
}: {
  title: string;
  tone: string;
  groups: [string, AgentVote[]][];
}) {
  if (groups.length === 0) return null;

  return (
    <div>
      <p className={`mb-1 text-label ${tone}`}>{title}</p>
      {groups.map(([family, rows]) => (
        <div key={family} className="mb-1.5">
          <p className="text-micro text-muted">{family}</p>
          {rows.map((v) => (
            <VoteRow
              key={v.agent}
              agent={v.agent}
              direction={v.verdict}
              confidence={v.confidence}
              note={v.note}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const PANEL_TITLE = "Why this is flagged";

export default function WhyPanel({ ticker }: { ticker: string }) {
  const [votesOpen, setVotesOpen] = useState(false);
  const votesId = useId();

  const { actionCard } = useTickerData(ticker);
  const { data, error, isLoading, isValidating, mutate } = actionCard;

  // The sentiment and catalyst legs read off today's bridge row. The panel
  // fetches it itself rather than taking a prop — the whole file is ~4KB and
  // the leg sentences are the panel's own answer, not the page's.
  const { data: bridge } = useSWR<{ signals: BridgeRow[] }>(
    "/api/bridge",
    (url: string) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      }),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const bridgeRow =
    bridge?.signals?.find((r) => r.ticker?.toUpperCase() === ticker.toUpperCase()) ?? null;

  const timedOut = (error as Error | undefined)?.message === "504";

  if (isLoading) {
    return (
      <Panel title={PANEL_TITLE}>
        <Loading variant="lines" count={5} label="Running 70 agents… ~10s" />
      </Panel>
    );
  }

  // Only a hard-error panel when we have no cached card at all. A transient
  // failure with prior data falls through to the normal render (stale-marked).
  if (!data) {
    const retrying = timedOut && isValidating;
    return (
      <Panel title={PANEL_TITLE}>
        <Failed
          title={timedOut ? "Scoring timed out" : "Argus API offline"}
          message={
            timedOut
              ? retrying
                ? "The ensemble is slow, not offline. Retrying now."
                : "The ensemble is slow, not offline. Retry, or read the rest of the page without it."
              : "Nothing scored this name because the API is not answering."
          }
          detail={timedOut ? undefined : "cd argus && ./run.sh api"}
          action={
            !retrying ? (
              <button
                type="button"
                onClick={() => mutate()}
                className="rounded border border-accent/40 px-2 py-0.5 text-data text-accent transition-colors hover:bg-accent/10"
              >
                Retry
              </button>
            ) : undefined
          }
        />
      </Panel>
    );
  }

  const {
    verdict,
    score,
    score_ci_lo,
    score_ci_hi,
    agreement_pct,
    inflation_gap,
    combo,
    family_votes,
    family_attribution,
    n_eff,
    ticker_regime,
    adx_value,
    adx_slope,
    meta_note,
    votes,
    agreed,
    dissented,
  } = data;

  const ciLo = score_ci_lo ?? null;
  const ciHi = score_ci_hi ?? null;
  const ciWide = ciLo !== null && ciHi !== null && ciHi - ciLo > 0.25;
  const agrPct =
    agreement_pct >= 2 ? Math.round(agreement_pct) : Math.round(agreement_pct * 100);
  const inflationAbove = (inflation_gap ?? 0) > 0.15;

  const comboPrefix = combo ? combo.slice(0, 4) : null;
  const comboNote = comboPrefix ? COMBO_NOTE[comboPrefix] : null;

  // Build family rows sorted by |attribution| desc, "other" last
  const familyRowData: {
    family: string;
    longV: number;
    shortV: number;
    waitV: number;
    attribution: number | undefined;
  }[] = [];

  if (family_votes) {
    const entries = Object.entries(family_votes);
    const other = entries.find(([k]) => k === "other");
    const rest = entries.filter(([k]) => k !== "other");

    const sorted = rest.sort((a, b) => {
      const attrA = Math.abs(family_attribution?.[a[0]] ?? 0);
      const attrB = Math.abs(family_attribution?.[b[0]] ?? 0);
      return attrB - attrA;
    });

    if (other) sorted.push(other);

    for (const [family, counts] of sorted) {
      familyRowData.push({
        family,
        longV: counts.long,
        shortV: counts.short,
        waitV: counts.wait,
        attribution: family_attribution?.[family],
      });
    }
  }

  // Title row content
  const ciStr =
    ciLo !== null && ciHi !== null
      ? ` [${ciLo.toFixed(2)}–${ciHi.toFixed(2)}]`
      : "";

  // Votes accordion data
  const agreedSet = new Set(agreed ?? []);
  const allVotes = votes ?? [];
  const agreedVotes = allVotes.filter(
    (v) => v.verdict === verdict && agreedSet.has(v.agent)
  );
  const dissentedVotes = allVotes.filter((v) => !agreedSet.has(v.agent));
  const agreedCount = agreed?.length ?? agreedVotes.length;
  const dissentedCount = dissented?.length ?? dissentedVotes.length;
  const familyOrder = familyRowData.map((r) => r.family);

  // Legs lead. A leg only exists when its feed does — no bridge row, no
  // chatter or catalyst leg, and the panel says so by not drawing them.
  const legs: Leg[] = [];
  if (bridgeRow) legs.push(sentimentLeg(bridgeRow));
  legs.push(technicalLeg(data));
  if (bridgeRow) legs.push(fundamentalLeg(bridgeRow));

  // The call the legs add up to. The conviction clause is the point of the
  // foot: it is what "two green and one amber" buys you.
  const rawCall = data.action_label ?? bridgeRow?.action_label ?? null;
  const call = rawCall
    ? `${BADGE_LABEL[rawCall] ?? rawCall}${
        data.high_conviction ? ", high conviction" : ", not high conviction"
      }`
    : `${BADGE_LABEL[verdict] ?? verdict} at ${score.toFixed(2)}`;

  const titleActions = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-data text-muted">
        <span className={verdict === "WAIT" ? "text-muted" : "text-model"}>{verdict}</span>{" "}
        <span className="text-model">{score.toFixed(2)}</span>
        {ciStr && (
          <span className="text-muted">{ciStr}</span>
        )}
        {" "}
        <span className="text-foreground">{agrPct}%</span>
      </span>
      {ciWide && (
        <span className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px text-label text-warn">
          wide
        </span>
      )}
      {error && (
        <InfoTip
          label="Why this reading is stale"
          content={
            timedOut ? "Scoring timed out — showing the last result." : "Refresh failed — showing the last result."
          }
          className="inline-flex items-center rounded border border-muted/40 bg-muted/10 px-1.5 py-px text-label text-muted"
        >
          stale
        </InfoTip>
      )}
    </div>
  );

  return (
    <Panel title={PANEL_TITLE} actions={titleActions} readThis={legsReadThis(legs, call)}>
      <div className="space-y-3">
        {/* Inflation warning */}
        {inflationAbove && (
          <div className="flex items-start gap-1.5 rounded border border-warn/40 bg-warn/5 px-3 py-2">
            <AlertTriangle size={12} className="text-warn mt-px shrink-0" />
            <span className="text-body leading-snug text-warn">
              High inflation gap — correlated consensus, discount this score.
            </span>
          </div>
        )}

        {/* Meta callout — an alarm, not a diagnostic, so it stays above. */}
        {meta_note && meta_note.trim().length > 0 && (
          <div className="flex items-start gap-1.5 rounded border border-warn/40 bg-warn/5 px-3 py-2">
            <AlertTriangle size={12} className="text-warn mt-px shrink-0" />
            <span className="text-body leading-snug text-warn">Meta-analyst: {meta_note}</span>
            <span className="ml-1 shrink-0 text-label text-muted">
              advisory only
            </span>
          </div>
        )}

        {/* The three legs — the answer */}
        <div className="space-y-[10px]">
          {legs.map((leg) => (
            <LegRow key={leg.key} leg={leg} />
          ))}
        </div>

        {/* Everything the ensemble knows — diagnostics, behind a disclosure */}
        <Collapsible
          className="border-t border-line pt-2"
          persistKey="why-ensemble"
          trigger={<span className="text-body text-muted">How the ensemble voted</span>}
        >
          <div className="space-y-3 pt-3">
            {/* Combo headline */}
            {combo && (
              <div className="space-y-1">
                <span className="text-data text-foreground">
                  combo <span className="font-medium">{combo}</span>
                </span>
                {comboNote && (
                  <p className="text-body leading-snug text-muted">— {comboNote}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {COMBO_POSITION_LABEL.map(([family, gloss], i) => {
                    const letter = combo[i] as "L" | "S" | "N";
                    return (
                      <InfoTip
                        key={family}
                        content={
                          <>
                            {gloss} {COMBO_LETTER_LABEL[letter]}.{" "}
                            <Link
                              href={`/learn/glossary#${glossarySlug(family)}`}
                              className="underline decoration-dotted text-accent"
                            >
                              Glossary ↗
                            </Link>
                          </>
                        }
                      >
                        <span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-label text-muted">
                          {family}
                          <span className={`text-data ${letter === "N" ? "text-muted" : "text-model"}`}>
                            {letter}
                          </span>
                        </span>
                      </InfoTip>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Family rows */}
            {familyRowData.length > 0 && (
              <div className="space-y-0">
                {familyRowData.map((row) => (
                  <FamilyRow key={row.family} {...row} />
                ))}
              </div>
            )}

            {/* Chips: n_eff + regime + ADX */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {n_eff !== undefined && (
                <span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5">
                  <span className="text-label text-muted">n_eff</span>
                  <span className="text-data text-foreground">{n_eff.toFixed(1)}</span>
                  <InfoTip content="Higher is not better — high n_eff backtested worse" label="n_eff info" />
                </span>
              )}
              {ticker_regime && (
                <StatChip label="regime" value={ticker_regime.replace(/_/g, " ")} />
              )}
              {adx_value !== undefined && (
                <StatChip
                  label="ADX"
                  value={`${adx_value.toFixed(0)}${adx_slope ? ` ${adx_slope}` : ""}`}
                />
              )}
            </div>

            {/* Agent votes accordion */}
            <div className="border-t border-line pt-2">
              <button
                type="button"
                onClick={() => setVotesOpen((v) => !v)}
                className="flex items-center gap-1.5 text-left w-full"
                aria-expanded={votesOpen}
                aria-controls={votesId}
              >
                <ChevronDown
                  size={12}
                  className="text-muted transition-transform duration-150 shrink-0"
                  style={{ transform: votesOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                />
                <span className="text-data text-muted">
                  agent votes (
                  <span className="text-foreground">{agreedCount} agreed</span>
                  {" · "}
                  <span className="text-foreground">{dissentedCount} dissented</span>
                  )
                </span>
              </button>

              <div id={votesId} hidden={!votesOpen} className="mt-2 space-y-3">
                <VoteSection title="Dissented" tone="text-foreground" groups={groupVotesByFamily(dissentedVotes, familyOrder)} />
                <VoteSection title="Agreed" tone="text-muted" groups={groupVotesByFamily(agreedVotes, familyOrder)} />
              </div>
            </div>
          </div>
        </Collapsible>
      </div>
    </Panel>
  );
}
