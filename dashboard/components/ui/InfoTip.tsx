"use client";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { ReactNode } from "react";

export interface InfoTipProps {
  /** Tooltip body text (or short JSX, e.g. a <ul> of catalyst names). */
  content: ReactNode;
  /** Trigger content. Default: a small Info glyph (12px), matching the existing header/inline icon usage. */
  children?: ReactNode;
  /** aria-label for icon-only triggers (required when children is omitted or non-text). */
  label?: string;
  className?: string;
}

export default function InfoTip({ content, children, label, className }: InfoTipProps) {
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
          className="z-50 max-w-xs rounded border border-line bg-elevated px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-muted shadow-lg"
          sideOffset={4}
        >
          {content}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
