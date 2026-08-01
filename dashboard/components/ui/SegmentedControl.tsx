"use client";

export interface SegmentedOption<T extends string | number> {
  key: T;
  label: string;
  /** One line describing what this option does, shown for the *selected*
   * option only. A per-option tooltip documents the thing you are not using. */
  blurb?: string;
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
  value,
  options,
  onChange,
  children,
  className = "",
}: SegmentedControlProps<T>) {
  const selected = options.find((o) => o.key === value);
  const pills = variant === "pills";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {!labelHidden && <span className="eyebrow shrink-0">{label}</span>}
      <div
        role="radiogroup"
        aria-label={label}
        className={
          pills
            ? "flex shrink-0 items-center gap-1.5"
            : "flex shrink-0 rounded-md border border-line bg-elevated p-[2px]"
        }
      >
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              key={String(o.key)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.key)}
              className={`px-2 py-0.5 text-body transition-colors ${
                pills ? "rounded border" : "rounded-[4px]"
              } ${
                active
                  ? pills
                    ? "border-line-strong bg-elevated font-medium text-foreground"
                    : "bg-raised font-medium text-foreground"
                  : pills
                    ? "border-line text-muted hover:border-line-strong hover:text-foreground"
                    : "text-muted hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {selected?.blurb && <span className="text-body text-2">{selected.blurb}</span>}
      {children}
    </div>
  );
}
