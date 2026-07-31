"use client";

import Sparkline from "@/components/ui/Sparkline";
import { NEUTRAL_BAND, scopeLabel, signed, toneClass, toneLabel, type MacroTile } from "@/lib/macro";

function Delta({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <span className="font-mono text-micro text-muted-2" title="Not enough history yet">
        {label} —
      </span>
    );
  }
  const flat = Math.abs(value) < 0.005;
  const tone = flat ? "text-muted" : value > 0 ? "text-pos" : "text-neg";
  const arrow = flat ? "→" : value > 0 ? "↑" : "↓";
  return (
    <span className={`font-mono text-micro tabular-nums ${tone}`}>
      {label} {arrow}
      {signed(value)}
    </span>
  );
}

/** One sentiment scope: level, direction and shape — a page about change can't show only a number (MAC-07). */
export default function ScopeTile({
  tile,
  selected,
  onSelect,
}: {
  tile: MacroTile;
  selected: boolean;
  onSelect: () => void;
}) {
  const inBand = Math.abs(tile.score) <= NEUTRAL_BAND;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded border p-2 text-left transition-colors ${
        selected ? "border-accent bg-accent/5" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-micro text-muted">{scopeLabel(tile.scope)}</span>
        <span className="font-mono text-micro uppercase tracking-wide text-muted-2">
          {toneLabel(tile.score)}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className={`font-mono text-body tabular-nums ${toneClass(tile.score)}`}>
          {signed(tile.score)}
          {inBand && <span className="ml-1 text-micro text-muted-2">in band</span>}
        </span>
        <Sparkline
          values={tile.spark}
          w={64}
          h={20}
          className={selected ? "text-accent" : "text-muted-2"}
        />
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <Delta label="1h" value={tile.delta_1h} />
        <Delta label="1d" value={tile.delta_1d} />
        <span className="font-mono text-micro text-muted-2" title="Scored headlines in this lookback">
          n={tile.n}
        </span>
      </div>
    </button>
  );
}
