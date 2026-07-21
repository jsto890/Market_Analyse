"use client";

import { useState, useEffect, useId, ReactNode } from "react";
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
  defaultOpen = false,
  persistKey,
  actions,
  children,
}: PanelProps) {
  const id = useId();
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

  const Title = (
    <>
      <span className="tick truncate text-[13px] font-semibold text-foreground">{title}</span>
      {subtitle && <span className="truncate text-[12px] text-muted">{subtitle}</span>}
    </>
  );

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
        className="overflow-hidden transition-[max-height] duration-200"
        style={{
          maxHeight: !collapsible || (hydrated ? open : defaultOpen) ? "9999px" : "0px",
        }}
      >
        <div className="border-t border-line px-4 py-3">{children}</div>
      </div>
    </section>
  );
}
