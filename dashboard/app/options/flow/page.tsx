"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useLadder, useOdteSymbol } from "@/lib/odte";
import { useOptionsUi } from "@/lib/optionsUi";
import { flowTilt, type FlowTilt } from "@/lib/odte-verdicts";
import type { PcrPayload } from "@/lib/odteCompanion";
import FlowRatioTile, { RatioGauge, SideSegments } from "@/components/odte/FlowRatioTile";
import FlowTiltCard from "@/components/odte/FlowTiltCard";
import UnusualPrintsTable, {
  isCall,
  strikeLabel,
  type UnusualFlowPayload,
} from "@/components/odte/UnusualPrintsTable";
import VolumeVsOiBars from "@/components/odte/VolumeVsOiBars";
import Page from "@/components/ui/Page";

const jsonFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

/** The tile's own wording for the shared tilt — the mock words the tile
 *  "Call-leaning" and the prose card "call-heavy". Only the label differs;
 *  the boundaries come from `lib/odte-verdicts.ts`. */
const TILT_WORD: Record<FlowTilt, string> = {
  "call-heavy": "Call-leaning",
  balanced: "Balanced",
  "put-heavy": "Put-leaning",
};

export default function OptionsFlowPage() {
  const [activeSymbol] = useOdteSymbol();
  const { expiry } = useOptionsUi();

  const { data: pcr } = useSWR<PcrPayload>(`/api/odte/pcr?symbol=${activeSymbol}`, jsonFetcher, {
    refreshInterval: 60_000,
  });
  const { data: unusual } = useSWR<UnusualFlowPayload>(
    `/api/odte/unusual?symbol=${activeSymbol}`,
    jsonFetcher,
    { refreshInterval: 60_000 }
  );
  const { data: ladder } = useLadder(activeSymbol, 4, 0.5);

  const idx = Math.max(0, (ladder?.expiries ?? []).findIndex((e) => e.expiry === expiry));
  const ladderRows = ladder?.expiries?.[idx]?.rows ?? [];
  const prints = useMemo(() => unusual?.rows ?? [], [unusual]);

  const { callPrints, topStrike, topStrikeCount } = useMemo(() => {
    const byStrike = new Map<number, number>();
    for (const p of prints) byStrike.set(p.strike, (byStrike.get(p.strike) ?? 0) + 1);
    let strike: number | null = null;
    let n = 0;
    for (const [k, v] of Array.from(byStrike.entries())) {
      if (v > n) {
        strike = k;
        n = v;
      }
    }
    return {
      callPrints: prints.filter((p) => isCall(p.side)).length,
      topStrike: strike,
      topStrikeCount: n,
    };
  }, [prints]);

  const pcrVol = pcr?.pcr_vol ?? null;
  const pcrOi = pcr?.pcr_oi ?? null;

  return (
    <Page width="wide">
      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-3">
        {pcrVol != null && (
          <FlowRatioTile
            label="Put / call · volume"
            value={pcrVol.toFixed(2)}
            legend={
              <>
                <span>call-heavy</span>
                <span>1.0</span>
                <span>put-heavy</span>
              </>
            }
            sentence={`${TILT_WORD[flowTilt(pcrVol)]}: ${Math.round(pcrVol * 100)} puts traded today for every 100 calls.`}
          >
            <RatioGauge ratio={pcrVol} />
          </FlowRatioTile>
        )}

        {pcrOi != null && (
          <FlowRatioTile
            label="Put / call · open interest"
            value={pcrOi.toFixed(2)}
            legend={
              <>
                <span>call-heavy</span>
                <span>1.0</span>
                <span>put-heavy</span>
              </>
            }
            sentence={`${Math.round(pcrOi * 100)} puts stand open for every 100 calls${
              pcrVol != null && flowTilt(pcrOi) !== flowTilt(pcrVol)
                ? `, so the book on the table disagrees with today's flow`
                : ""
            }.`}
          >
            <RatioGauge ratio={pcrOi} />
          </FlowRatioTile>
        )}

        {unusual && (
          <FlowRatioTile
            label="Unusual prints"
            value={String(prints.length)}
            valueTone={prints.length > 0 ? "text-warn" : "text-foreground"}
            legend={
              prints.length > 0 ? (
                <>
                  <span>{callPrints} call side</span>
                  <span>{prints.length - callPrints} put side</span>
                </>
              ) : undefined
            }
            sentence={
              topStrike != null && topStrikeCount > 1
                ? `${topStrikeCount} of them land on the ${strikeLabel(topStrike)} strike.`
                : undefined
            }
          >
            {/* Grouped, not in score order: the segments are a split, and the legend under them names the two groups. */}
            <SideSegments
              sides={[
                ...Array(callPrints).fill("C"),
                ...Array(prints.length - callPrints).fill("P"),
              ]}
            />
          </FlowRatioTile>
        )}
      </div>

      <div className="grid gap-[16px] lg:grid-cols-[1fr_360px]">
        <UnusualPrintsTable rows={prints} asOf={unusual?.as_of} />
        <div className="flex flex-col gap-[12px]">
          <VolumeVsOiBars rows={ladderRows} spot={ladder?.spot ?? null} />
          <FlowTiltCard pcrVol={pcrVol} pcrOi={pcrOi} prints={prints} />
        </div>
      </div>
    </Page>
  );
}
