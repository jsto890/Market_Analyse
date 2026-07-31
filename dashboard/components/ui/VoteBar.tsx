interface VoteBarProps {
  long: number;
  short: number;
  wait: number;
  /** Full width in a card, fixed width in a table cell. */
  className?: string;
}

/**
 * The ensemble's vote split as one bar. Three numeric columns said the same
 * thing three times and left the reader to divide; the proportion is the
 * whole point, and it is the one thing a stack shows without arithmetic.
 *
 * Not P&L green/red — these are model votes. Long carries the model hue,
 * short the caution hue (dissent on a long-candidate screen is a warning,
 * not a loss), and wait the neutral line colour, which reads as absence.
 */
export default function VoteBar({ long, short, wait, className = "" }: VoteBarProps) {
  const total = long + short + wait;
  if (total <= 0) return null;
  const seg = [
    { n: long, color: "var(--model)" },
    { n: short, color: "var(--amber)" },
    { n: wait, color: "var(--line-strong)" },
  ];
  const label = `${long} long, ${short} short, ${wait} wait`;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex h-2 overflow-hidden rounded-sm bg-elevated align-middle ${className}`}
    >
      {seg.map((s, i) => (
        <span key={i} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} />
      ))}
    </span>
  );
}
