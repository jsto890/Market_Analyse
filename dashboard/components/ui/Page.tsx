import type { ReactNode } from "react";
import Link from "next/link";

export type PageWidth = "prose" | "wide" | "full";

/** Three content caps and no others. `full` is fluid — it keeps the 24px gutter
 * but lets the ladder and the ticker header use the whole viewport.
 *
 * `full` was re-tried at `wide` and put back (X-02). At 1440 the 188px costs
 * the ticker page its "Why this is flagged" panel title, which clips, and wraps
 * the ladder's control row onto a second line while insetting its full-bleed
 * chrome bars 94px inside the options tab bar directly above them. Two rungs
 * 28px apart is only what it looks like at the audit's 1280. */
const WIDTH_CLASS: Record<PageWidth, string> = {
  prose: "max-w-[var(--w-prose)]", // 880px — /alerts, /learn/*
  wide: "max-w-[var(--w-wide)]", // 1180px — /, /watchlist, /screener, /portfolio, /rotation, /macro, /calendar
  full: "max-w-none", // fluid — /t/[ticker], /options/ladder
};

export interface PageProps {
  width?: PageWidth;
  /** Drop the horizontal gutter, for a page that paints its own full-bleed
   * chrome bars (the options sub-shell). Vertical rhythm is unaffected. */
  flush?: boolean;
  children: ReactNode;
}

export interface PageHeaderProps {
  title: ReactNode;
  /** One line of supporting detail. Tertiary tone — it is not the title. */
  subtitle?: ReactNode;
  /** Provenance/freshness, rendered beside the title. Usually `<Stale …/>`. */
  status?: ReactNode;
  /** Verbs. Right-aligned. */
  actions?: ReactNode;
  breadcrumb?: { href: string; label: string }[];
}

/**
 * The single owner of page gutter, content cap and vertical rhythm. Every route
 * renders through this; pages must not re-declare mx-auto / max-w-* / px-* /
 * py-* / min-h-screen. `RailShell` owns the scroll — a page that sets its own
 * viewport height nests a scroller inside a scroller.
 *
 * `min-h-full` + `flex-col` means a short page (portfolio with TWS offline, an
 * empty screener) can hand its state component `flex-1` and fill the viewport
 * rather than leaving 600px of black below the fold. `shrink-0` is what makes
 * that safe: `#main` is a fixed-height flex column, so without it this element
 * is squeezed to the viewport and squeezes its own sections in turn — the ticker
 * sub-nav was compressed to 8px and its labels clipped to slivers.
 */
export function Page({ width = "wide", flush = false, children }: PageProps) {
  return (
    <main
      data-page-width={width}
      className={`mx-auto flex min-h-full w-full shrink-0 flex-col ${WIDTH_CLASS[width]} ${
        flush ? "" : "px-[var(--page-x)]"
      } py-[var(--page-y)] gap-[var(--stack)]`}
    >
      {children}
    </main>
  );
}

/** Page title row: breadcrumb, headline, subtitle, status, actions. The one
 * header component — `PageHeader` and the hand-rolled `<h1>`s fold into it. */
function Header({ title, subtitle, status, actions, breadcrumb }: PageHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-line pb-3">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 eyebrow">
            {breadcrumb.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-baseline gap-2.5">
          <h1 className="truncate text-headline tracking-[-0.01em] text-foreground">{title}</h1>
          {status && <div className="flex shrink-0 items-center gap-2">{status}</div>}
        </div>
        {subtitle && <p className="mt-1 text-body text-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** Optional grouping wrapper. Sections passed straight to `Page` already get
 * the between-section gap; `Page.Body` gives a nested run the same rhythm. */
function Body({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-[var(--stack)] ${className}`}>{children}</div>;
}

/** Tighter run — related rows inside one section. */
function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-[var(--stack-tight)] ${className}`}>{children}</section>
  );
}

Page.Header = Header;
Page.Body = Body;
Page.Section = Section;

export default Page;
