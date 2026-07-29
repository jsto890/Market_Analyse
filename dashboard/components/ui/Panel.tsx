"use client";

import { useState, useEffect, useId, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface PanelProps {
  title: ReactNode;
  /** Optional count chip rendered next to the title, e.g. Panel's own row/section count. Replaces the old `` `${title}  (${count})` `` string-concat pattern. */
  count?: number;
  subtitle?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  persistKey?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function Panel({
  title,
  count,
  subtitle,
  collapsible,
  defaultOpen = false,
  persistKey,
  actions,
  children,
}: PanelProps) {
  const id = useId();
  const storageKey = persistKey ? `dash:collapsible:${persistKey}` : null;

  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        setOpen(stored === "true");
      } else {
        // One-time migration: check for legacy dash:panel: key (contract §F)
        const legacyKey = `dash:panel:${persistKey}`;
        const legacyStored = localStorage.getItem(legacyKey);
        if (legacyStored !== null) {
          // Migrate: use legacy value, write to new key, remove old key
          const value = legacyStored === "true";
          setOpen(value);
          localStorage.setItem(storageKey, String(value));
          localStorage.removeItem(legacyKey);
        }
      }
    }
    setHydrated(true);
  }, [storageKey, persistKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      localStorage.setItem(storageKey, String(next));
    }
  }

  const Title = (
    <>
      <span className="tick truncate text-[13px] font-semibold text-foreground">{title}</span>
      {count !== undefined && (
        <span className="rounded bg-elevated px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
          {count}
        </span>
      )}
      {subtitle && <span className="truncate text-[12px] text-muted">{subtitle}</span>}
    </>
  );

  const isOpen = !collapsible || (hydrated ? open : defaultOpen);

  return (
    <section className="rounded-md border border-line bg-elevated">
      <div className="flex items-center gap-2 px-4 py-2.5">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-expanded={open}
            aria-controls={id}
          >
            {Title}
            <ChevronDown
              size={14}
              className="ml-auto shrink-0 text-muted transition-transform duration-200"
              style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">{Title}</div>
        )}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line px-4 py-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
