"use client";

import { useState, useEffect, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface PanelProps {
  title: string;
  subtitle?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  persistKey?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function Panel({
  title,
  subtitle,
  collapsible,
  defaultOpen = true,
  persistKey,
  actions,
  children,
}: PanelProps) {
  const storageKey = persistKey ? `dash:panel:${persistKey}` : null;

  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        setOpen(stored === "true");
      }
    }
    setHydrated(true);
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      localStorage.setItem(storageKey, String(next));
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            className="flex flex-1 items-center gap-2 text-left min-w-0"
            aria-expanded={open}
          >
            <span className="font-medium text-[13px] truncate">{title}</span>
            {subtitle && (
              <span className="text-[12px] text-muted truncate">{subtitle}</span>
            )}
            <ChevronDown
              size={14}
              className="ml-auto shrink-0 text-muted transition-transform duration-200"
              style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <span className="font-medium text-[13px] truncate">{title}</span>
            {subtitle && (
              <span className="text-[12px] text-muted truncate">{subtitle}</span>
            )}
          </div>
        )}
        {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {(!collapsible || (hydrated && open) || (!hydrated && defaultOpen)) && (
        <div className="border-t border-line px-4 py-3">{children}</div>
      )}
    </section>
  );
}
