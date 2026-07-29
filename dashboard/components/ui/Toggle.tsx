"use client";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name — required, since the visual track carries no text. */
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-accent bg-accent-dim" : "border-line bg-raised",
        className ?? "",
      ].join(" ")}
    >
      <span
        className={["inline-block h-3.5 w-3.5 rounded-full bg-foreground transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]"].join(" ")}
      />
    </button>
  );
}
