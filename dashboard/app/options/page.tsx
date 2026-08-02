"use client";

import Link from "next/link";
import useSWR from "swr";
import { useLadder, useOdteSymbol } from "@/lib/odte";
import {
  companionSymbol,
  fmtGex,
  pctFrom,
  type GexLevels,
  type PcrPayload,
  type UnusualPayload,
} from "@/lib/odteCompanion";
import { useRailQuotes } from "@/lib/rail-quotes";
import {
  deriveLevels,
  deriveFlow,
  deriveShape,
  type Verdict,
  type VerdictStatus,
} from "@/lib/odte-verdicts";
import GexCard from "@/components/odte/GexCard";
import UnusualCard from "@/components/odte/UnusualCard";
import PcrCard from "@/components/odte/PcrCard";
import SpotCard from "@/components/odte/SpotCard";
import StrikeGuidance from "@/components/odte/StrikeGuidance";
import VerdictCard from "@/components/odte/VerdictCard";
import Page from "@/components/ui/Page";

const jsonFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

/** Named input to the session read: the card it belongs to, and its verdict. */
type Voter = { name: string; verdict: Verdict };

/** Bar and text tone per verdict status — the same teal / amber / quiet triple
 * the verdict cards already use for their left border. */
const STATUS_BAR: Record<VerdictStatus, string> = {
  good: "bg-teal",
  neutral: "bg-muted",
  caution: "bg-warn",
};

const listJoin = (items: string[]) =>
  items.length <= 1
    ? items[0] ?? ""
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** One tick on the expected-move band, with its label above (or below, for the
 * taller spot mark, so the two rows never collide). */
function Mark({
  x,
  label,
  barClass,
  textClass,
  below = false,
}: {
  x: number;
  label: string;
  barClass: string;
  textClass: string;
  below?: boolean;
}) {
  return (
    <>
      <div
        className={`absolute w-[2px] ${below ? "top-[14px] h-[24px]" : "top-[18px] h-[16px]"} ${barClass}`}
        style={{ left: `${x}%` }}
      />
      <div
        className={`absolute ${below ? "top-[40px] font-semibold" : "top-0"} -translate-x-1/2 whitespace-nowrap text-data leading-none ${textClass}`}
        style={{ left: `${x}%` }}
      >
        {label}
      </div>
    </>
  );
}

/**
 * Today's box: the expected move drawn as a band, with the put wall, zero-gamma,
 * spot and call wall marked on it. Without a spot and an expected move there is
 * no band to draw, so the section renders nothing rather than an empty track.
 */
function ExpectedMoveBox({
  spot,
  emPct,
  expiry,
  zeroGamma,
  callWall,
  putWall,
}: {
  spot: number | null;
  emPct: number | null;
  expiry?: string;
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
}) {
  if (spot == null || emPct == null) return null;
  const move = (spot * emPct) / 100;
  const lo = spot - move;
  const hi = spot + move;
  const levels = [putWall, zeroGamma, callWall].filter((v): v is number => v != null);
  const domainLo = Math.min(lo, ...levels);
  const domainHi = Math.max(hi, ...levels);
  if (domainHi <= domainLo) return null;
  const pad = (domainHi - domainLo) * 0.12;
  const from = domainLo - pad;
  const to = domainHi + pad;
  const pos = (v: number) => ((v - from) / (to - from)) * 100;

  return (
    <section className="rounded-[8px] border border-line bg-surface p-[14px_20px_12px]">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <span className="eyebrow">Today&apos;s box</span>
        <span className="text-data text-muted">
          expected move ±{emPct.toFixed(2)}%{expiry ? ` · ${expiry}` : ""}
        </span>
      </div>
      <div className="relative h-[56px]">
        <div className="absolute inset-x-0 top-[22px] h-[8px] rounded-[4px] bg-elevated" />
        <div
          className="absolute top-[22px] h-[8px] rounded-[4px] bg-raised"
          style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }}
        />
        {putWall != null && (
          <Mark x={pos(putWall)} label={`put wall ${putWall}`} barClass="bg-put" textClass="text-put" />
        )}
        {zeroGamma != null && (
          <Mark
            x={pos(zeroGamma)}
            label={`zero-γ ${zeroGamma}`}
            barClass="bg-teal"
            textClass="text-teal"
          />
        )}
        {callWall != null && (
          <Mark
            x={pos(callWall)}
            label={`call wall ${callWall}`}
            barClass="bg-teal"
            textClass="text-teal"
          />
        )}
        <Mark
          x={pos(spot)}
          label={`spot ${spot.toFixed(2)}`}
          barClass="bg-foreground"
          textClass="text-foreground"
          below
        />
        <div
          className="absolute top-[40px] -translate-x-1/2 whitespace-nowrap text-data leading-none text-muted-2"
          style={{ left: `${pos(lo)}%` }}
        >
          {lo.toFixed(2)}
        </div>
        <div
          className="absolute top-[40px] -translate-x-1/2 whitespace-nowrap text-data leading-none text-muted-2"
          style={{ left: `${pos(hi)}%` }}
        >
          {hi.toFixed(2)}
        </div>
      </div>
    </section>
  );
}

export default function OptionsOverviewPage() {
  const [activeSymbol] = useOdteSymbol();

  const { data: gexData, isLoading: gexLoading } = useSWR<GexLevels>(
    `/api/odte/gex?symbol=${activeSymbol}`,
    jsonFetcher,
    { refreshInterval: 60_000 }
  );
  const { data: pcrData, isLoading: pcrLoading } = useSWR<PcrPayload>(
    `/api/odte/pcr?symbol=${activeSymbol}`,
    jsonFetcher,
    { refreshInterval: 60_000 }
  );
  const { data: unusualData, isLoading: unusualLoading } = useSWR<UnusualPayload>(
    `/api/odte/unusual?symbol=${activeSymbol}`,
    jsonFetcher,
    { refreshInterval: 60_000 }
  );
  const { data: ladder, isLoading: ladderLoading } = useLadder(activeSymbol, 1);
  const { data: railData } = useRailQuotes();
  const spot =
    railData?.quotes.find((q) => q.symbol === companionSymbol(activeSymbol))?.price ??
    ladder?.spot ??
    null;

  const zeroGamma = gexData?.zero_gamma ?? ladder?.levels?.zero_gamma ?? null;
  const callWall = gexData?.call_wall ?? ladder?.levels?.call_wall ?? null;
  const putWall = gexData?.put_wall ?? ladder?.levels?.put_wall ?? null;
  const totalGex = gexData?.total_gex ?? ladder?.levels?.total_gex ?? null;

  const levelsVerdict = deriveLevels({ spot, zeroGamma, callWall, putWall, totalGex });
  const flowVerdict = deriveFlow({
    pcrVol: pcrData?.pcr_vol ?? null,
    pcrOi: pcrData?.pcr_oi ?? null,
    unusualCount: unusualData?.rows.length ?? 0,
  });

  const firstExpiry = ladder?.expiries[0];
  const atmRow =
    firstExpiry && spot != null
      ? firstExpiry.rows.reduce(
          (best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best),
          firstExpiry.rows[0]
        )
      : undefined;
  const shapeVerdict = deriveShape({
    atmPutIv: atmRow?.put?.iv ?? null,
    atmCallIv: atmRow?.call?.iv ?? null,
  });

  const spotVerdict: Verdict | null =
    spot != null
      ? {
          status: "neutral",
          sentence: `${activeSymbol} ${spot.toFixed(2)}${
            zeroGamma != null ? ` · ${pctFrom(spot, zeroGamma)} to zero-gamma` : ""
          }`,
        }
      : null;

  // The session read counts the four verdicts already derived above — the modal
  // status is the read, everything outside it is named as dissent. No second
  // derivation: `lib/odte-verdicts.ts` stays the only place the logic lives.
  const voters: Voter[] = (
    [
      { name: "Spot / Regime", verdict: spotVerdict },
      { name: "Levels", verdict: levelsVerdict },
      { name: "Shape / Skew", verdict: shapeVerdict },
      { name: "Flow / Stats", verdict: flowVerdict },
    ] as { name: string; verdict: Verdict | null }[]
  ).filter((v): v is Voter => v.verdict != null);

  const tally = voters.reduce<Record<string, number>>((acc, v) => {
    acc[v.verdict.status] = (acc[v.verdict.status] ?? 0) + 1;
    return acc;
  }, {});
  // Ties break on card order, so the read never flickers between two equal counts.
  const readStatus = voters.reduce<VerdictStatus | null>(
    (best, v) => (best == null || tally[v.verdict.status] > tally[best] ? v.verdict.status : best),
    null
  );
  const agreeing = voters.filter((v) => v.verdict.status === readStatus);
  const dissenting = voters.filter((v) => v.verdict.status !== readStatus);

  const boxClause =
    putWall != null && callWall != null ? `, with the box between ${putWall} and ${callWall}` : "";
  const sessionRead =
    levelsVerdict == null
      ? null
      : levelsVerdict.status === "good"
        ? `Dealer hedging is absorbing moves while spot holds above zero-gamma${boxClause}.`
        : levelsVerdict.status === "caution"
          ? `Dealer hedging is extending moves while spot sits below zero-gamma${boxClause}.`
          : `Spot is pinned at zero-gamma, so hedging flow cuts both ways${boxClause}.`;

  const nearestWallDist =
    spot != null && (callWall != null || putWall != null)
      ? [callWall, putWall]
          .filter((w): w is number => w != null)
          .map((w) => Math.abs(w - spot))
          .sort((a, b) => a - b)[0]
      : null;

  return (
    <Page width="wide">
      {voters.length > 0 && (
        <section className="rounded-[8px] border border-line-strong bg-elevated p-[18px_20px]">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <span className="eyebrow">Session read</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-label text-muted">
                {agreeing.length} of {voters.length} inputs agree
              </span>
              <span aria-hidden className="flex gap-[3px]">
                {voters.map((v, i) => (
                  <span
                    key={v.name}
                    className={`h-[4px] w-[22px] rounded-[2px] ${
                      i < agreeing.length && readStatus ? STATUS_BAR[readStatus] : "bg-line-strong"
                    }`}
                  />
                ))}
              </span>
            </span>
          </div>
          {sessionRead && (
            <p className="mb-2.5 text-headline leading-[1.35] tracking-[-0.01em] [text-wrap:pretty]">
              {sessionRead}
            </p>
          )}
          <p className="max-w-[920px] text-body leading-[1.6] text-3 [text-wrap:pretty]">
            {listJoin(agreeing.map((v) => v.name))}{" "}
            {agreeing.length === 1 ? "carries the read" : "read the same way"}.
            {dissenting.length > 0 && (
              <>
                {" "}
                {listJoin(dissenting.map((v) => v.name))}{" "}
                {dissenting.length === 1
                  ? "is the dissenting input"
                  : "are the dissenting inputs"}
                : {dissenting.map((v) => v.verdict.sentence).join("; ")}.
              </>
            )}
          </p>
        </section>
      )}

      <ExpectedMoveBox
        spot={spot}
        emPct={firstExpiry?.expected_move_pct ?? null}
        expiry={firstExpiry?.expiry}
        zeroGamma={zeroGamma}
        callWall={callWall}
        putWall={putWall}
      />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <VerdictCard
          title="Spot / Regime"
          verdict={spotVerdict}
          loading={!spot && ladderLoading}
          whyItMatters="Spot relative to zero-gamma sets the dealer-hedging regime for the session."
          detail={<SpotCard symbol={activeSymbol} spot={spot} zeroGamma={zeroGamma} />}
        />
        <VerdictCard
          title="Levels"
          verdict={levelsVerdict}
          loading={gexLoading}
          stats={[
            { label: "call wall", value: callWall != null ? String(callWall) : "—" },
            { label: "put wall", value: putWall != null ? String(putWall) : "—" },
          ]}
          whyItMatters="Zero-gamma and dealer walls mark where hedging flow accelerates or dampens moves."
          detail={<GexCard symbol={activeSymbol} />}
        />
        <VerdictCard
          title="Shape / Skew"
          verdict={shapeVerdict}
          loading={ladderLoading}
          whyItMatters="Put/call IV skew shows whether hedging or speculative demand dominates near the money."
          detail={
            <div className="space-y-1 text-data">
              <div className="flex justify-between">
                <span className="text-muted">ATM strike</span>
                <span className="text-foreground">{atmRow?.strike ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">call IV</span>
                <span className="text-foreground">
                  {atmRow?.call?.iv != null ? `${(atmRow.call.iv * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">put IV</span>
                <span className="text-foreground">
                  {atmRow?.put?.iv != null ? `${(atmRow.put.iv * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
              <Link href="/options/gamma" className="mt-1 block text-teal hover:underline">
                full skew →
              </Link>
            </div>
          }
        />
        <VerdictCard
          title="Flow / Stats"
          verdict={flowVerdict}
          loading={pcrLoading || unusualLoading}
          stats={[
            { label: "P/C oi", value: pcrData?.pcr_oi != null ? pcrData.pcr_oi.toFixed(2) : "—" },
          ]}
          whyItMatters="Put/call ratio plus unusual prints flag where today's option flow is leaning."
          detail={
            <div className="space-y-2">
              <PcrCard symbol={activeSymbol} />
              <UnusualCard symbol={activeSymbol} />
              <Link href="/options/flow" className="block text-teal hover:underline">
                full flow →
              </Link>
            </div>
          }
        />
      </section>

      <section className="flex flex-wrap items-center gap-4 border-y border-line px-4 py-2 text-data">
        <span>
          <span className="text-muted">net GEX </span>
          <span className={(totalGex ?? 0) >= 0 ? "text-pos" : "text-neg"}>{fmtGex(totalGex)}</span>
        </span>
        <span>
          <span className="text-muted">nearest wall </span>
          <span className="text-foreground">
            {nearestWallDist != null ? nearestWallDist.toFixed(2) : "—"}
          </span>
        </span>
        <Link href="/options/ladder" className="ml-auto text-teal hover:underline">
          Open ladder →
        </Link>
      </section>

      <StrikeGuidance
        spot={spot}
        zeroGamma={zeroGamma}
        callWall={callWall}
        putWall={putWall}
        atm={atmRow?.strike ?? null}
        emPct={firstExpiry?.expected_move_pct ?? null}
      />
    </Page>
  );
}
