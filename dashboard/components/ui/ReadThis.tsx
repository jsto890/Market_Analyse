import type { ReactNode } from "react";

/**
 * One always-visible sentence at the **foot** of a data panel saying what it is
 * for and what would make you act. Not a tooltip, not collapsible, not a
 * caveat repeated four times — one strip, at the bottom, above the panel edge.
 *
 * 12px is deliberate and lives only here: the strip is panel chrome sitting
 * under 13px content, and the design specifies it explicitly. Nothing else in
 * the app may declare a 12px size.
 */
export default function ReadThis({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 border-t border-line px-4 py-2.5 text-[12px] leading-[1.5] text-muted">
      <span className="text-2">Read this</span> — {children}
    </p>
  );
}

/** The emphasised term inside a read-this sentence. */
export function ReadThisTerm({ children }: { children: ReactNode }) {
  return <b className="font-semibold text-2">{children}</b>;
}
