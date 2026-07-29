// dashboard/components/ui/Collapsible.tsx
"use client";
import { useEffect, useId, useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type CollapsibleDisabled =
  | { disabled?: false; disabledReason?: never }
  | { disabled: true; disabledReason: string };

export type CollapsibleProps = {
  /** Trigger content (rendered inside the toggle button, left of the chevron). */
  trigger: ReactNode;
  children: ReactNode;
  /** Uncontrolled initial state when no persistKey (or no stored value yet). Default: false. */
  defaultOpen?: boolean;
  /** localStorage key suffix — persisted at `dash:collapsible:{persistKey}`. Omit for non-persisted (e.g. per-row) instances. */
  persistKey?: string;
  className?: string;
  triggerClassName?: string;
} & CollapsibleDisabled;

export default function Collapsible({
  trigger,
  children,
  defaultOpen = false,
  persistKey,
  disabled,
  disabledReason,
  className,
  triggerClassName,
}: CollapsibleProps) {
  const id = useId();
  const storageKey = persistKey ? `dash:collapsible:${persistKey}` : null;
  const [open, setOpen] = useState(defaultOpen);

  // Hydration-safe: render `defaultOpen` on the server and the first client
  // pass (matching), then reconcile from localStorage post-mount.
  useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) setOpen(stored === "true");
    }
  }, [storageKey]);

  function toggle() {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    if (storageKey) localStorage.setItem(storageKey, String(next));
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-expanded={open}
        aria-controls={id}
        className={[
          "flex w-full items-center gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed",
          triggerClassName ?? "",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1">{trigger}</span>
        {!disabled && (
          <ChevronDown
            size={14}
            className="ml-auto shrink-0 text-muted transition-transform duration-200"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        )}
      </button>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
