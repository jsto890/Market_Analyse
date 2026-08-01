import { IMPORTANCE_RANK, importanceChipClass } from "@/lib/calendar";
import { IMPORTANCE_LABEL } from "@/lib/eventMeta";

/**
 * How much a release matters, as three letters in a fixed slot: bare text, no
 * border, no fill. A box drawn around a three-letter code is furniture repeated
 * on every row of a 28-row day — the colour alone carries the tier.
 *
 * The slot holds its width with or without a value so the names beside it still
 * line up, and the tier is spelled out for a screen reader, which cannot read a
 * colour.
 */
export default function RankText({
  importance,
  className,
}: {
  importance: string;
  className?: string;
}) {
  return (
    <span
      className={`w-[26px] flex-shrink-0 text-micro font-semibold ${importanceChipClass(
        importance
      )} ${className ?? ""}`}
    >
      <span className="sr-only">{IMPORTANCE_LABEL[importance] ?? importance} importance</span>
      <span aria-hidden>{IMPORTANCE_RANK[importance] ?? importance}</span>
    </span>
  );
}
