import type { ReactNode } from "react";

export type PageWidth = "reading" | "standard" | "wide" | "full";

/** Content caps. `wide`/`full` scale with the viewport instead of stranding
 * gutters on a 1920 screen (the audit measured 485px of dead space at 1920
 * with a fixed max-w-6xl). */
const WIDTH_CLASS: Record<PageWidth, string> = {
  reading: "max-w-[720px]", // prose: glossary, learn, brief
  standard: "max-w-[1040px]", // tables + panels: today, watchlist, alerts
  wide: "max-w-[1440px]", // dense grids: ticker, rotation, macro
  full: "max-w-none", // edge-to-edge: options ladder
};

export interface PageShellProps {
  width?: PageWidth;
  /** Drop the horizontal gutter — for pages that own their own chrome bars
   * (the options sub-shell paints full-bleed toolbars). */
  flush?: boolean;
  children: ReactNode;
}

/**
 * The single owner of page gutter, max-width and vertical rhythm. Every route
 * renders through this; pages must not re-declare mx-auto/max-w/px-*.
 *
 * `min-h-full` + `flex-col` means a short page (portfolio with TWS offline,
 * an empty screener) can hand its EmptyState `flex-1` and have it fill the
 * viewport rather than leaving 600px of black below the fold.
 */
export function PageShell({ width = "standard", flush = false, children }: PageShellProps) {
  return (
    <main
      className={`mx-auto flex min-h-full w-full flex-col ${WIDTH_CLASS[width]} ${
        flush ? "" : "px-[var(--page-x)]"
      } py-[var(--page-y)] gap-[var(--stack)]`}
    >
      {children}
    </main>
  );
}

export default PageShell;
