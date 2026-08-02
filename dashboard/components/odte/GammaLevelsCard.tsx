import { fmtLevel } from "@/components/odte/gammaFormat";

export interface GammaLevelsCardProps {
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  /** Live ladder only. */
  maxPain: number | null;
}

/** Each level carries the sentence that says what it does. Not a tooltip: the
 *  sentence is the content, and a level nobody can read is a number nobody
 *  should act on. */
export default function GammaLevelsCard({
  zeroGamma,
  callWall,
  putWall,
  maxPain,
}: GammaLevelsCardProps) {
  const rows = [
    {
      label: "Zero gamma",
      value: zeroGamma,
      tone: "text-teal",
      sentence: "The sign flip. Above it hedging absorbs moves; below it hedging feeds them.",
    },
    {
      label: "Call wall",
      value: callWall,
      tone: "text-teal",
      sentence:
        "Heaviest dealer gamma above spot — a magnet on approach, resistance on arrival.",
    },
    {
      label: "Put wall",
      value: putWall,
      tone: "text-put",
      sentence:
        "Mirror of the call wall below spot. Support while it holds; an air pocket once it breaks.",
    },
    {
      label: "Max pain",
      value: maxPain,
      tone: "text-2",
      sentence:
        "Where the most contracts expire worthless — weak on its own, stronger the closer it sits to a wall.",
    },
  ].filter((r): r is typeof r & { value: number } => r.value != null);

  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[8px] border border-line bg-surface">
      <div className="border-b border-line px-[14px] py-[11px] text-title text-foreground">
        Levels
      </div>
      <div className="flex flex-col gap-[11px] px-[14px] py-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-body font-semibold ${r.tone}`}>{r.label}</span>
              <span className="text-data text-foreground">{fmtLevel(r.value)}</span>
            </div>
            <p className="m-0 mt-[3px] text-body text-muted">{r.sentence}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
