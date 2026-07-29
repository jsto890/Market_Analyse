import type { ReactNode } from "react";

export type PageWidth = "reading" | "dense";

const WIDTH_CLASS: Record<PageWidth, string> = {
  reading: "max-w-5xl",
  dense: "max-w-[1400px]",
};

export interface PageShellProps {
  /** "reading" (default, max-w-5xl) for prose/table pages; "dense"
   * (max-w-[1400px]) for data-heavy grids (G-09 — two widths max). */
  width?: PageWidth;
  children: ReactNode;
}

/** Single owner of page padding, max-width, and scroll (G-08) so pages stop
 * each hand-rolling their own min-h-screen/h-full wrapper. Adoption per
 * page happens in each page's own phase — this primitive has no callers
 * yet. */
export function PageShell({ width = "reading", children }: PageShellProps) {
  return (
    <div className={`h-full overflow-y-auto ${WIDTH_CLASS[width]} mx-auto px-6 py-4`}>
      {children}
    </div>
  );
}
