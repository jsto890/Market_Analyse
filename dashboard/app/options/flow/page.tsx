"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useLadder, useOdteSymbol } from "@/lib/odte";
import { densityPct, withinBand } from "@/lib/optionsAnalytics";
import { useOptionsUi } from "@/lib/optionsUi";
import type { PcrPayload } from "@/lib/odteCompanion";
import { deriveFlow } from "@/lib/odte-verdicts";
import PcrCard from "@/components/odte/PcrCard";
import UnusualCard from "@/components/odte/UnusualCard";
import Panel from "@/components/ui/Panel";
import InfoTip from "@/components/ui/InfoTip";
import Empty from "@/components/ui/Empty";
import Page from "@/components/ui/Page";
import { compactNumber } from "@/lib/format";

const jsonFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export default function OptionsFlowPage() {
  const [activeSymbol] = useOdteSymbol();
  const { density, expiry } = useOptionsUi();
  const band = densityPct(density);

  const { data: pcr } = useSWR<PcrPayload>(`/api/odte/pcr?symbol=${activeSymbol}`, jsonFetcher, {
    refreshInterval: 60_000,
  });
  const { data: ladder } = useLadder(activeSymbol, 4, band ?? 0.5);

  const idx = Math.max(0, (ladder?.expiries ?? []).findIndex((e) => e.expiry === expiry));
  const rows = useMemo(
    () => withinBand(ladder?.expiries?.[idx]?.rows ?? [], ladder?.spot ?? null, band),
    [ladder, idx, band]
  );

  const { callVol, putVol, callOi, putOi, busiest } = useMemo(() => {
    let cv = 0,
      pv = 0,
      co = 0,
      po = 0;
    let top: { strike: number; vol: number } | null = null;
    for (const r of rows) {
      cv += r.call?.vol ?? 0;
      pv += r.put?.vol ?? 0;
      co += r.call?.oi ?? 0;
      po += r.put?.oi ?? 0;
      const vol = (r.call?.vol ?? 0) + (r.put?.vol ?? 0);
      if (!top || vol > top.vol) top = { strike: r.strike, vol };
    }
    return { callVol: cv, putVol: pv, callOi: co, putOi: po, busiest: top };
  }, [rows]);

  const verdict = deriveFlow({
    pcrVol: pcr?.pcr_vol ?? null,
    pcrOi: pcr?.pcr_oi ?? null,
    unusualCount: 0,
  });

  const totalVol = callVol + putVol;
  const callShare = totalVol > 0 ? (callVol / totalVol) * 100 : null;

  return (
    <Page width="wide">
      {verdict && (
        <p className="rounded border border-line bg-elevated px-3 py-2 text-body text-2">
          {verdict.sentence}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Today's tape"
          subtitle={`${density} density · ${rows.length} strikes`}
          actions={
            <InfoTip
              label="Where these totals come from"
              content="Summed across the strikes currently in view, so the density control changes them. Volume is today's trading; open interest is positions still on the book from previous sessions."
            />
          }
        >
          {totalVol === 0 ? (
            <Empty message="No volume in this band yet." />
          ) : (
            <div className="space-y-2 text-data">
              <div className="flex h-2 overflow-hidden rounded bg-raised">
                <div className="bg-call/60" style={{ width: `${callShare ?? 0}%` }} />
                <div className="bg-put/60" style={{ width: `${100 - (callShare ?? 0)}%` }} />
              </div>
              <div className="flex justify-between">
                <span className="text-call">calls {compactNumber(callVol)}</span>
                <span className="text-muted">
                  {callShare != null ? `${callShare.toFixed(0)}% of volume is calls` : ""}
                </span>
                <span className="text-put">puts {compactNumber(putVol)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>call OI {compactNumber(callOi)}</span>
                <span>put OI {compactNumber(putOi)}</span>
              </div>
              {busiest && (
                <p className="text-body text-2">
                  Busiest strike {busiest.strike} on {compactNumber(busiest.vol)} contracts — where
                  today&apos;s argument is actually being had.
                </p>
              )}
            </div>
          )}
        </Panel>

        <PcrCard symbol={activeSymbol} />
        <UnusualCard symbol={activeSymbol} />
      </div>
    </Page>
  );
}
