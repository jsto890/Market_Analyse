"use client";

import Panel from "@/components/ui/Panel";
import InfoTip from "@/components/ui/InfoTip";
import Empty from "@/components/ui/Empty";
import { deltaBands, type DeltaBandRow } from "@/lib/optionsAnalytics";
import type { StrikeLevel } from "@/lib/optionsLive";

function Cell({ strike, delta }: { strike: number | null; delta: number | null }) {
  return (
    <td className="px-2 py-1 text-right">
      {strike != null ? (
        <>
          <span className="text-foreground">{strike.toFixed(0)}</span>
          {delta != null && (
            <span className="ml-1 text-muted">{Math.abs(delta).toFixed(2)}Δ</span>
          )}
        </>
      ) : (
        <span className="text-muted">—</span>
      )}
    </td>
  );
}

export default function DeltaBandsCard({ levels }: { levels: StrikeLevel[] }) {
  const rows: DeltaBandRow[] = deltaBands(levels);
  const hasAny = rows.some((r) => r.callStrike != null || r.putStrike != null);

  return (
    <Panel
      title="Delta bands"
      actions={
        <InfoTip
          label="What delta bands mean"
          content="The strikes currently trading at 50Δ, 25Δ and 16Δ on each side. Delta doubles as a rough probability of finishing in the money, so these are the market's own price ladder for 'likely', 'possible' and 'tail'."
        />
      }
    >
      {!hasAny ? (
        <Empty message="No greeks in this snapshot — turn the live ladder on." />
      ) : (
        <table className="w-full text-data">
          <thead>
            <tr className="text-micro uppercase tracking-[0.06em] text-muted">
              <th className="px-2 py-1 text-left font-normal">band</th>
              <th className="px-2 py-1 text-right font-normal text-call">call</th>
              <th className="px-2 py-1 text-right font-normal text-put">put</th>
              <th className="px-2 py-1 text-right font-normal">IV c / p</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.target} className="border-t border-line/50">
                <td className="px-2 py-1 text-foreground">{Math.round(r.target * 100)}Δ</td>
                <Cell strike={r.callStrike} delta={r.callDelta} />
                <Cell strike={r.putStrike} delta={r.putDelta} />
                <td className="px-2 py-1 text-right text-muted">
                  {r.callIv != null ? `${(r.callIv * 100).toFixed(0)}%` : "—"} /{" "}
                  {r.putIv != null ? `${(r.putIv * 100).toFixed(0)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-body leading-relaxed text-2">
        50Δ is the coin flip and carries the most gamma; 16Δ is the tail the market prices at about
        one in six. Delta is a hedging ratio, not a promise.
      </p>
    </Panel>
  );
}
