import Panel from "@/components/ui/Panel";
import Empty from "@/components/ui/Empty";
import type { LadderRow } from "@/lib/odte-core";
import { strikeLabel } from "@/components/odte/UnusualPrintsTable";

interface StrikeBar {
  strike: number;
  ratio: number;
  callLed: boolean;
  nearest: boolean;
}

/** The five strikes closest to spot, each measured as today's volume against the book standing there. */
export function volumeVsOi(rows: LadderRow[], spot: number | null, count = 5): StrikeBar[] {
  if (spot == null || rows.length === 0) return [];
  const near = [...rows]
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, count);
  const nearestStrike = near[0]?.strike;
  const bars: StrikeBar[] = [];
  for (const r of near) {
    const callVol = r.call?.vol ?? 0;
    const putVol = r.put?.vol ?? 0;
    const oi = (r.call?.oi ?? 0) + (r.put?.oi ?? 0);
    if (oi <= 0) continue;
    bars.push({
      strike: r.strike,
      ratio: (callVol + putVol) / oi,
      callLed: callVol >= putVol,
      nearest: r.strike === nearestStrike,
    });
  }
  return bars.sort((a, b) => a.strike - b.strike);
}

function footer(bars: StrikeBar[]): string | null {
  if (bars.length === 0) return null;
  const opening = bars.filter((b) => b.ratio >= 1);
  if (opening.length === 0) {
    return "No strike here is trading above its own open interest — today is recycling the book that was already there.";
  }
  if (opening.length === 1) {
    return `Only ${strikeLabel(opening[0].strike)} is trading above its own open interest — the one strike where positioning is being built rather than recycled.`;
  }
  if (opening.length === bars.length) {
    return `All ${bars.length} are trading above their own open interest — positioning here is being built, not recycled.`;
  }
  return `${opening.length} of these ${bars.length} are trading above their own open interest — where positioning is being built rather than recycled.`;
}

export default function VolumeVsOiBars({ rows, spot }: { rows: LadderRow[]; spot: number | null }) {
  const bars = volumeVsOi(rows, spot);
  const max = bars.reduce((m, b) => Math.max(m, b.ratio), 0);
  const note = footer(bars);

  return (
    <Panel title="Volume vs open interest">
      {bars.length === 0 ? (
        <Empty message="No open interest at the strikes around spot yet." />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {bars.map((b) => (
              <div key={b.strike} className="flex items-center gap-2">
                <span
                  className={`w-[34px] shrink-0 text-data ${b.nearest ? "text-foreground" : "text-muted"}`}
                >
                  {strikeLabel(b.strike)}
                </span>
                <span className="relative h-[12px] flex-1 overflow-hidden rounded-[3px] bg-raised">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-[2px] opacity-60 ${b.callLed ? "bg-call" : "bg-put"}`}
                    style={{ width: `${max > 0 ? (b.ratio / max) * 100 : 0}%` }}
                  />
                </span>
                <span
                  className={`w-[42px] shrink-0 text-right text-data ${b.ratio >= 1 ? "text-warn" : "text-3"}`}
                >
                  {b.ratio.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          {note && (
            <p className="mt-[10px] border-t border-line pt-[10px] text-body text-muted">{note}</p>
          )}
        </>
      )}
    </Panel>
  );
}
