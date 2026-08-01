/**
 * A figure and the word for what it is, in one cell: `act 51.2`.
 *
 * The label is inline with its value and lowercase because a column label
 * stacked over every cell prints itself once per row — 84 times on a 28-row
 * page — while saying what one header at the top of the column would say once.
 * A cell with no value prints a lone dash and no label at all: "prior —" is two
 * words for nothing.
 */
export default function ValueCell({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string | null | undefined;
  /** The figure the row is actually about — the print, not what was expected. */
  strong?: boolean;
  className?: string;
}) {
  if (!value) {
    return <span className={`text-data text-muted-2 ${className ?? ""}`}>—</span>;
  }
  return (
    <span className={`text-data ${className ?? ""}`}>
      <span className="text-muted">{label} </span>
      <span className={strong ? "text-foreground" : "text-3"}>{value}</span>
    </span>
  );
}
