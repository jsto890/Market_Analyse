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
import { deriveLevels, deriveFlow, deriveShape, type Verdict } from "@/lib/odte-verdicts";
import GexCard from "@/components/odte/GexCard";
import UnusualCard from "@/components/odte/UnusualCard";
import PcrCard from "@/components/odte/PcrCard";
import SpotCard from "@/components/odte/SpotCard";
import StrikeGuidance from "@/components/odte/StrikeGuidance";
import VerdictCard from "@/components/odte/VerdictCard";

const jsonFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

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

  const nearestWallDist =
    spot != null && (callWall != null || putWall != null)
      ? [callWall, putWall]
          .filter((w): w is number => w != null)
          .map((w) => Math.abs(w - spot))
          .sort((a, b) => a - b)[0]
      : null;

  return (
    <>
      <section className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
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
            <div className="space-y-1 font-mono text-[11px] tabular-nums">
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

      <section className="flex flex-wrap items-center gap-4 border-y border-line px-4 py-2 font-mono text-[11px] tabular-nums">
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
        <span>
          <span className="text-muted">expected move </span>
          <span className="text-foreground">
            {firstExpiry?.expected_move_pct != null
              ? `${firstExpiry.expected_move_pct.toFixed(2)}%`
              : "—"}
          </span>
        </span>
        <Link href="/options/ladder" className="ml-auto text-teal hover:underline">
          Open ladder →
        </Link>
      </section>

      <div className="p-3">
        <StrikeGuidance
          spot={spot}
          zeroGamma={zeroGamma}
          callWall={callWall}
          putWall={putWall}
          atm={atmRow?.strike ?? null}
          emPct={firstExpiry?.expected_move_pct ?? null}
        />
      </div>
    </>
  );
}
