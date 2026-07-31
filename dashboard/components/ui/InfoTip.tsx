"use client";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { ReactNode } from "react";

export interface InfoTipProps {
  /** Tooltip body text (or short JSX, e.g. a <ul> of catalyst names). */
  content: ReactNode;
  /**
   * Trigger content. Must render visible pixels — an `sr-only` child produces
   * a trigger nobody can see or point at, which is how four explanations on
   * `/odte` and `/odte/strikes` became unreachable. Omit it and you get the
   * Info glyph; pass a visible node and you get that.
   *
   * If the trigger is a *term* rather than an icon, use `Gloss` instead: it
   * opens on click, works on touch, and reads as explainable at a glance.
   */
  children?: ReactNode;
  /** aria-label for icon-only triggers (required when children is omitted or non-text). */
  label?: string;
  className?: string;
}

export default function InfoTip({ content, children, label, className }: InfoTipProps) {
  if (process.env.NODE_ENV !== "production" && typeof children === "object" && children !== null) {
    const cls = (children as { props?: { className?: string } })?.props?.className ?? "";
    if (/\bsr-only\b/.test(cls)) {
      throw new Error(
        "InfoTip: an sr-only child renders no visible trigger. Pass a visible child, omit children for the Info glyph, or use <Gloss> for a term.",
      );
    }
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label ?? (children ? undefined : "More info")}
          className={["inline-flex cursor-default items-center text-muted hover:text-foreground", className ?? ""].join(" ")}
        >
          {children ?? <Info size={12} />}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 max-w-xs rounded border border-line bg-elevated px-2 py-1.5 text-body font-normal normal-case tracking-normal text-2 shadow-lg"
          sideOffset={4}
        >
          {content}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
