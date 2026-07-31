"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HEADER_GLOSS } from "@/lib/labels";

export interface GlossProps {
  /** The term as it reads on screen. Also the default `HEADER_GLOSS` key. */
  term: ReactNode;
  /** Explicit lookup key when the visible term differs from the glossary key. */
  lookup?: string;
  /** The definition. Two lines. Omit to fall back to `HEADER_GLOSS[lookup ?? term]`. */
  children?: ReactNode;
  className?: string;
}

/**
 * A term that explains itself. Dotted underline in the term's own colour;
 * *click* (not hover) opens the definition; Escape or an outside click closes.
 *
 * This is the replacement for the tooltip-only explanation layer: an `InfoTip`
 * whose child was `sr-only` rendered no visible trigger at all, and a `title=`
 * is mouse-only and unreachable on touch. The trigger here is a real focusable
 * button that reads as explainable at a glance.
 */
export default function Gloss({ term, lookup, children, className = "" }: GlossProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const key = lookup ?? (typeof term === "string" ? term : undefined);
  const body = children ?? (key ? HEADER_GLOSS[key] : undefined);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // No definition to give — render the term, not a dead affordance.
  if (!body) return <>{term}</>;

  return (
    <span ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        // currentColor: the underline is the term's own colour, so a --model
        // score and a --muted column header each gloss in their own tone.
        className="cursor-help border-b border-dotted border-current"
      >
        {term}
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-[calc(100%+6px)] z-50 block w-[280px] rounded border border-line-strong bg-elevated px-2.5 py-2 text-body font-normal normal-case tracking-normal text-2 shadow-lg"
        >
          {body}
        </span>
      )}
    </span>
  );
}
