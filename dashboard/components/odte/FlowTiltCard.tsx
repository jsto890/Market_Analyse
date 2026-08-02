import { compactNumber } from "@/lib/format";
import { flowTilt } from "@/lib/odte-verdicts";
import {
  isCall,
  strikeLabel,
  vsOi,
  type UnusualPrint,
} from "@/components/odte/UnusualPrintsTable";

/**
 * The tilt of the session in prose, read off the two feeds this page already
 * has: the put/call ratios and the unusual prints. Every clause is derived —
 * nothing here compares to a history the endpoint does not carry.
 */
export default function FlowTiltCard({
  pcrVol,
  pcrOi,
  prints,
}: {
  pcrVol: number | null;
  pcrOi: number | null;
  prints: UnusualPrint[];
}) {
  const lead =
    pcrVol != null
      ? `Today's flow is ${flowTilt(pcrVol)}${
          pcrOi != null ? ` against a ${flowTilt(pcrOi)} standing book` : ""
        }.`
      : null;

  const rest: string[] = [];
  if (prints.length > 0) {
    const calls = prints.filter((p) => isCall(p.side)).length;
    rest.push(
      `${calls} of the ${prints.length} unusual prints are on the call side.`
    );

    const opening = prints.filter((p) => {
      const r = vsOi(p);
      return (r != null && r >= 1) || p.oi === 0;
    });
    if (opening.length > 0) {
      const top = opening.reduce((a, b) => ((b.vol ?? 0) > (a.vol ?? 0) ? b : a));
      const ratio = vsOi(top);
      rest.push(
        `The largest of those opening new positioning is ${compactNumber(top.vol)} contracts on the ${strikeLabel(top.strike)}${isCall(top.side) ? "C" : "P"}${
          ratio != null ? `, ${ratio.toFixed(2)}× the open interest already there` : ", against a strike with no book at all"
        }.`
      );
    } else {
      rest.push(
        "None of them is larger than the open interest behind it — this is trading inside the existing book, not building on it."
      );
    }
  }

  if (!lead && rest.length === 0) return null;

  return (
    <div className="rounded-[8px] border border-line bg-elevated p-[13px_15px]">
      <div className="eyebrow mb-[7px]">Flow tilt</div>
      <p className="m-0 text-body text-2 [text-wrap:pretty]">
        {lead && <b className="font-semibold">{lead}</b>}
        {lead && rest.length > 0 ? " " : null}
        {rest.join(" ")}
      </p>
    </div>
  );
}
