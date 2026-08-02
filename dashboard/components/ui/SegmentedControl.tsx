"use client";

export interface SegmentedOption<T extends string | number> {
  key: T;
  label: string;
  /** How many rows sit behind this segment, printed inline after the label. A
   * segment without one renders as the label alone. */
  count?: number;
  /** One line describing what this option does, shown for the *selected*
   * option only. A per-option tooltip documents the thing you are not using. */
  blurb?: string;
  /** `tablist` only: the tab's own id, and the id of the panel it reveals. A
   * radio sets a value; a tab owns a region, and the region has to say so. */
  id?: string;
  controls?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  /** Visible name of the control. A mode switch whose only label is an
   * `aria-label` reads as an unlabelled 36×20 rectangle to everyone else. */
  label: string;
  /** Drops the visible label, keeping it as the group's accessible name. Only
   * for a control whose own segments name the axis they set: "30d / 60d" does
   * not need the word HORIZON beside it. */
  labelHidden?: boolean;
  /** `pills` breaks the segments apart, so two controls sharing a row do not
   * read as one joined group of five. */
  variant?: "segmented" | "pills";
  /** Which ARIA vocabulary the group speaks. A radio sets a value and nothing
   * else moves; a tab owns the region below it. Same pixels either way — the
   * difference is what a screen reader is told happens when you press one. */
  as?: "radiogroup" | "tablist";
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Rendered after the segments — a status dot, a freshness line. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The one mode/density switch. Every segment carries its own text, so the
 * control states both what it is and which way it is set without a hover.
 * Replaces the bare `Toggle` for anything with a named mode.
 */
export default function SegmentedControl<T extends string | number>({
  label,
  labelHidden = false,
  variant = "segmented",
  as = "radiogroup",
  value,
  options,
  onChange,
  children,
  className = "",
}: SegmentedControlProps<T>) {
  const selected = options.find((o) => o.key === value);
  const pills = variant === "pills";
  const tabs = as === "tablist";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {!labelHidden && <span className="eyebrow shrink-0">{label}</span>}
      <div
        role={as}
        aria-label={label}
        className={
          pills
            ? "flex shrink-0 items-center gap-1.5"
            : "flex shrink-0 gap-[2px] rounded-[6px] border border-line bg-surface p-[3px]"
        }
      >
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              key={String(o.key)}
              type="button"
              role={tabs ? "tab" : "radio"}
              {...(tabs
                ? { "aria-selected": active, id: o.id, "aria-controls": o.controls }
                : { "aria-checked": active })}
              onClick={() => onChange(o.key)}
              className={`inline-flex items-center gap-[7px] text-body transition-colors ${
                pills
                  ? `rounded border px-2 py-0.5 ${
                      active
                        ? "border-line-strong bg-elevated font-medium text-foreground"
                        : "border-line text-muted hover:border-line-strong hover:text-foreground"
                    }`
                  : `rounded-[4px] p-[5px_12px] ${
                      active
                        ? "bg-raised font-semibold text-foreground"
                        : "font-medium text-muted hover:text-foreground"
                    }`
              }`}
            >
              {o.label}
              {o.count !== undefined && (
                <span className={`font-mono text-micro tabular-nums ${active ? "text-3" : ""}`}>
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selected?.blurb && <span className="text-body text-2">{selected.blurb}</span>}
      {children}
    </div>
  );
}
