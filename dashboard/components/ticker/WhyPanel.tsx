"use client";

import { useState, useId } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import Skeleton from "@/components/ui/Skeleton";
import StatChip from "@/components/ui/StatChip";
import CenterBar from "@/components/ui/CenterBar";
import InfoTip from "@/components/ui/InfoTip";
import { useTickerData } from "@/lib/useTickerData";
import { COMBO_POSITION_LABEL, COMBO_LETTER_LABEL } from "@/lib/labels";
import { glossarySlug } from "@/lib/glossarySlug";
import type { AgentVote } from "@/types/argus";

const COMBO_NOTE: Record<string, string> = {
  LSNS: "dip-buy profile — trend up, oscillators cooled (best backtested class)",
  LNLL: "trend + squeeze + oscillators confirming",
  LSNL: "trend up, mixed confirmation",
  LNNL: "chasing risk — oscillators confirm into extension (backtested negative)",
  LLNL: "chasing risk — everything confirming late (backtested ~flat)",
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="text-muted text-[11px] font-mono leading-none cursor-default select-none align-middle"
          aria-label="info"
        >
          i
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[240px]"
          sideOffset={4}
        >
          {text}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
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
      <span className="w-[90px] shrink-0 font-mono text-[11px] text-muted truncate">
        {family}
      </span>
      <CenterBar value={net} width={80} />
      <span className="font-mono text-[11px] text-foreground tabular-nums w-[28px] shrink-0">
        {netStr}
      </span>
      <span className="font-mono text-[11px] text-muted tabular-nums">
        {longV}/{total}
      </span>
      {attribution !== undefined && (
        <span
          className={`font-mono text-[11px] tabular-nums ml-auto shrink-0 ${
            attribution >= 0 ? "text-pos" : "text-neg"
          }`}
        >
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
  const dirClass =
    direction === "LONG"
      ? "text-pos"
      : direction === "SHORT"
      ? "text-neg"
      : "text-muted";

  return (
    <div className="flex items-baseline gap-2 py-px">
      <span className="font-mono text-[11px] text-foreground truncate flex-1 min-w-0">
        {agent}
      </span>
      <span className={`font-mono text-[11px] shrink-0 ${dirClass}`}>
        {direction}
      </span>
      <span className="font-mono text-[11px] text-muted tabular-nums shrink-0 w-[32px] text-right">
        {(confidence * 100).toFixed(0)}%
      </span>
      {note && (
        <span
          className="font-mono text-[11px] text-muted truncate max-w-[240px] shrink-0"
          title={note ?? undefined}
        >
          {note}
        </span>
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
      <p className={`font-mono text-[11px] tracking-wide mb-1 ${tone}`}>{title}</p>
      {groups.map(([family, rows]) => (
        <div key={family} className="mb-1.5">
          <p className="font-mono text-[11px] text-muted">{family}</p>
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

export default function WhyPanel({ ticker }: { ticker: string }) {
  const [votesOpen, setVotesOpen] = useState(false);
  const votesId = useId();

  const { actionCard } = useTickerData(ticker);
  const { data, error, isLoading, isValidating, mutate } = actionCard;

  const timedOut = (error as Error | undefined)?.message === "504";

  if (isLoading) {
    return (
      <Panel title="Why">
        <div className="space-y-2 py-1">
          <div className="flex items-center gap-2">
            <Skeleton width={180} height={14} />
            <Skeleton width={60} height={14} />
          </div>
          <p className="font-mono text-[11px] text-muted animate-pulse">
            Running 70 agents… ~10s
          </p>
          <Skeleton width="100%" height={8} className="mt-2" />
          <Skeleton width="100%" height={8} />
          <Skeleton width="80%" height={8} />
        </div>
      </Panel>
    );
  }

  // Only a hard-error panel when we have no cached card at all. A transient
  // failure with prior data falls through to the normal render (stale-marked).
  if (!data) {
    const retrying = timedOut && isValidating;
    return (
      <Panel title="Why">
        <div className="space-y-2 py-1">
          <p className={`font-mono text-[12px] ${timedOut ? "text-warn" : "text-neg"}`}>
            {timedOut ? (
              retrying ? (
                "Scoring timed out — retrying…"
              ) : (
                "Scoring timed out — the ensemble is slow, not offline."
              )
            ) : (
              <>
                Argus API offline — <code className="text-muted">cd argus &amp;&amp; ./run.sh api</code>
              </>
            )}
          </p>
          {!retrying && (
            <button
              type="button"
              onClick={() => mutate()}
              className="font-mono text-[11px] text-accent border border-accent/40 rounded px-2 py-0.5 hover:bg-accent/10 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
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

  const titleActions = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-mono text-[11px] tabular-nums text-muted">
        <span
          className={
            verdict === "LONG"
              ? "text-pos"
              : verdict === "SHORT"
              ? "text-neg"
              : "text-muted"
          }
        >
          {verdict}
        </span>{" "}
        <span className="text-foreground">{score.toFixed(2)}</span>
        {ciStr && (
          <span className="text-muted">{ciStr}</span>
        )}
        {" "}
        <span className="text-foreground tabular-nums">{agrPct}%</span>
      </span>
      {ciWide && (
        <span className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px font-mono text-[11px] text-warn">
          wide
        </span>
      )}
      {error && (
        <span
          className="inline-flex items-center rounded border border-muted/40 bg-muted/10 px-1.5 py-px font-mono text-[11px] text-muted"
          title={timedOut ? "scoring timed out — showing last result" : "refresh failed — showing last result"}
        >
          stale
        </span>
      )}
    </div>
  );

  return (
    <Panel title="WHY" actions={titleActions}>
      <div className="space-y-3">
        {/* Inflation warning */}
        {inflationAbove && (
          <div className="flex items-start gap-1.5 rounded border border-warn/40 bg-warn/5 px-3 py-2">
            <AlertTriangle size={12} className="text-warn mt-px shrink-0" />
            <span className="font-mono text-[11px] text-warn leading-snug">
              High inflation gap — correlated consensus, discount this score.
            </span>
          </div>
        )}

        {/* Combo headline */}
        {combo && (
          <div className="space-y-1">
            <span className="font-mono text-[12px] text-foreground">
              combo{" "}
              <span className="font-medium">{combo}</span>
            </span>
            {comboNote && (
              <p className="font-mono text-[11px] text-muted leading-snug">
                — {comboNote}
              </p>
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
                          href={`/glossary#${glossarySlug(family)}`}
                          className="underline decoration-dotted text-accent"
                        >
                          Glossary ↗
                        </Link>
                      </>
                    }
                  >
                    <span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {family}
                      <span className={letter === "L" ? "text-pos" : letter === "S" ? "text-neg" : "text-muted"}>
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
              <span className="text-[11px] text-muted">n_eff</span>
              <span className="font-mono text-[13px] tabular-nums text-foreground">
                {n_eff.toFixed(1)}
              </span>
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

        {/* Meta callout */}
        {meta_note && meta_note.trim().length > 0 && (
          <div className="flex items-start gap-1.5 rounded border border-warn/40 bg-warn/5 px-3 py-2">
            <AlertTriangle size={12} className="text-warn mt-px shrink-0" />
            <span className="font-mono text-[11px] text-warn leading-snug">
              Meta-analyst: {meta_note}
            </span>
            <span className="ml-1 font-mono text-[11px] text-muted shrink-0">
              advisory only
            </span>
          </div>
        )}

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
            <span className="font-mono text-[11px] text-muted">
              agent votes (
              <span className="text-pos">{agreedCount} agreed</span>
              {" · "}
              <span className="text-neg">{dissentedCount} dissented</span>
              )
            </span>
          </button>

          <div id={votesId} hidden={!votesOpen} className="mt-2 space-y-3">
            <VoteSection title="Dissented" tone="text-neg" groups={groupVotesByFamily(dissentedVotes, familyOrder)} />
            <VoteSection title="Agreed" tone="text-pos" groups={groupVotesByFamily(agreedVotes, familyOrder)} />
          </div>
        </div>
      </div>
    </Panel>
  );
}
